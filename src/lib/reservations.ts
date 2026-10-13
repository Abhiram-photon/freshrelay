import { db } from './db'
import { ApiError } from './errors'
import { generatePickupCode, pickupCodeHash, safeEqualHex } from './tokens'
import { notifyUser } from './notify'
import { audit } from './audit'
import { MAX_VERIFY_ATTEMPTS } from './config'
import { formatQty } from './units'
import type { Reservation } from '@prisma/client'

/**
 * Reservation domain service.
 *
 * v1 decision (documented in docs/DECISIONS.md): reservation creation is
 * immediately CONFIRMED — there is no separate accept step — so HELD only
 * appears if a confirm step is added later; the hold-timeout sweeper still
 * releases HELD rows as a forward-compatible safety net.
 *
 * Stock is decremented with a single atomic conditional UPDATE inside a
 * transaction (SQLite serialises writes), which is the equivalent of
 * `SELECT ... FOR UPDATE` + check on Postgres: concurrent reservations for the
 * last units can never oversell — the loser gets 0 affected rows → 409.
 */

type CreateInput = {
  listingId: string
  recipientUserId: string
  recipientOrgId: string
  recipientOrgName: string
  quantity: number
  pickupStart: Date
  pickupEnd: Date
}

export async function createReservation(input: CreateInput): Promise<{ reservationId: string; code: string }> {
  if (input.quantity < 1) {
    throw ApiError.unprocessable('QUANTITY_TOO_LOW', 'Quantity must be at least 1')
  }

  // Provider-side info for notifications
  const listingMeta = await db.listing.findUnique({
    where: { id: input.listingId },
    select: { title: true, org: { select: { ownerUserId: true, name: true } } },
  })
  if (!listingMeta) throw ApiError.notFound('Listing not found')

  const result = await db.$transaction(async (tx) => {
    const listing = await tx.listing.findUnique({
      where: { id: input.listingId },
      include: { org: true },
    })
    if (!listing) throw ApiError.notFound('Listing not found')

    const now = new Date()
    // Business rules: listing must be ACTIVE and inside its live window.
    if (listing.status !== 'ACTIVE') {
      throw ApiError.unprocessable('LISTING_NOT_ACTIVE', 'This listing is not open for reservations')
    }
    if (listing.windowEnd <= now || listing.expiresAt <= now) {
      throw ApiError.unprocessable('WINDOW_CLOSED', 'The collection window for this listing has closed')
    }

    // Pickup slot must fit inside the listing window.
    if (input.pickupStart < listing.windowStart) {
      throw ApiError.unprocessable('SLOT_OUTSIDE_WINDOW', 'Pickup slot starts before the collection window opens')
    }
    if (input.pickupEnd > listing.windowEnd) {
      throw ApiError.unprocessable('SLOT_OUTSIDE_WINDOW', 'Pickup slot ends after the collection window closes')
    }
    if (input.pickupEnd <= input.pickupStart) {
      throw ApiError.unprocessable('SLOT_INVALID', 'Pickup slot end must be after start')
    }
    if (input.pickupEnd <= now) {
      throw ApiError.unprocessable('SLOT_IN_PAST', 'Pickup slot is already over')
    }

    // Atomic, conditional stock decrement — prevents overselling under concurrency.
    const updated = await tx.$executeRaw`
      UPDATE "Listing"
      SET "quantityRemaining" = "quantityRemaining" - ${input.quantity},
          "version" = "version" + 1,
          "updatedAt" = ${new Date().toISOString()}
      WHERE "id" = ${input.listingId}
        AND "quantityRemaining" >= ${input.quantity}
        AND "status" = 'ACTIVE'
    `
    if (updated === 0) {
      throw ApiError.conflict('INSUFFICIENT_STOCK', 'Not enough quantity left — someone reserved it first')
    }

    const code = generatePickupCode()
    const reservation = await tx.reservation.create({
      data: {
        listingId: input.listingId,
        recipientOrgId: input.recipientOrgId,
        quantity: input.quantity,
        pickupStart: input.pickupStart,
        pickupEnd: input.pickupEnd,
        status: 'CONFIRMED',
        codeHash: pickupCodeHash(code),
      },
    })

    // Stock exhausted → RESERVED_OUT
    const after = await tx.listing.findUnique({
      where: { id: input.listingId },
      select: { quantityRemaining: true },
    })
    if (after && after.quantityRemaining <= 0) {
      await tx.listing.update({ where: { id: input.listingId }, data: { status: 'RESERVED_OUT' } })
    }

    return { reservation, code }
  })

  // Notifications + audit (outside the transaction)
  const qty = formatQty(input.quantity, (await db.listing.findUnique({ where: { id: input.listingId }, select: { unit: true } }))?.unit ?? '')
  await notifyUser(listingMeta.org.ownerUserId, 'RESERVATION_CREATED', {
    reservationId: result.reservation.id,
    listingId: input.listingId,
    listingTitle: listingMeta.title,
    recipientOrgName: input.recipientOrgName,
    quantityLabel: qty,
    pickupStart: input.pickupStart.toISOString(),
    pickupEnd: input.pickupEnd.toISOString(),
  }, {
    subject: `FreshRelay: new reservation for "${listingMeta.title}"`,
    body: `${input.recipientOrgName} reserved ${qty} of "${listingMeta.title}". Verify the pickup code when they arrive.`,
  })
  await notifyUser(input.recipientUserId, 'RESERVATION_CONFIRMED', {
    reservationId: result.reservation.id,
    listingId: input.listingId,
    listingTitle: listingMeta.title,
    quantityLabel: qty,
    pickupStart: input.pickupStart.toISOString(),
    pickupEnd: input.pickupEnd.toISOString(),
    code: result.code, // delivered once here; only a hash is stored on the reservation
  }, {
    subject: `FreshRelay: reservation confirmed — pickup code ${result.code}`,
    body: `Your reservation for "${listingMeta.title}" (${qty}) is confirmed.\nPickup slot: ${input.pickupStart.toISOString()} – ${input.pickupEnd.toISOString()}.\nShow this 6-digit code at pickup: ${result.code}`,
  })
  await audit(input.recipientUserId, 'RESERVATION_CREATED', 'Reservation', result.reservation.id, {
    listingId: input.listingId,
    quantity: input.quantity,
  })

  return { reservationId: result.reservation.id, code: result.code }
}

/**
 * Returns stock and closes a reservation as CANCELLED/EXPIRED.
 * A RESERVED_OUT listing returns to ACTIVE when stock is restored and the
 * window is still live.
 */
export async function releaseReservation(
  reservation: Pick<Reservation, 'id' | 'listingId' | 'quantity'>,
  newStatus: 'CANCELLED' | 'EXPIRED',
  reason?: string
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const updated = await tx.reservation.updateMany({
      where: { id: reservation.id, status: { in: ['HELD', 'CONFIRMED'] } },
      data: { status: newStatus, ...(reason ? { cancelReason: reason } : {}) },
    })
    if (updated.count === 0) return false

    await tx.$executeRaw`
      UPDATE "Listing"
      SET "quantityRemaining" = "quantityRemaining" + ${reservation.quantity},
          "version" = "version" + 1,
          "updatedAt" = ${new Date().toISOString()}
      WHERE "id" = ${reservation.listingId}
    `

    const now = new Date()
    const listing = await tx.listing.findUnique({
      where: { id: reservation.listingId },
      select: { status: true, windowEnd: true, expiresAt: true },
    })
    if (listing && listing.status === 'RESERVED_OUT' && listing.windowEnd > now && listing.expiresAt > now) {
      await tx.listing.update({ where: { id: reservation.listingId }, data: { status: 'ACTIVE' } })
    }
    return true
  })
}

export async function cancelReservation(
  reservationId: string,
  actor: { userId: string; role: string },
  reason?: string
): Promise<void> {
  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    include: {
      listing: { include: { org: { select: { id: true, name: true, ownerUserId: true } } } },
      recipientOrg: { select: { id: true, name: true, ownerUserId: true } },
    },
  })
  if (!reservation) throw ApiError.notFound('Reservation not found')

  const isRecipientOwner = reservation.recipientOrg.ownerUserId === actor.userId
  const isProviderOwner = reservation.listing.org.ownerUserId === actor.userId
  if (!isRecipientOwner && !isProviderOwner && actor.role !== 'ADMIN') {
    throw ApiError.notFound('Reservation not found')
  }
  if (!['HELD', 'CONFIRMED'].includes(reservation.status)) {
    throw ApiError.conflict('NOT_CANCELLABLE', `A ${reservation.status.toLowerCase()} reservation cannot be cancelled`)
  }

  await releaseReservation(reservation, 'CANCELLED', reason)

  const otherPartyId = isRecipientOwner
    ? reservation.listing.org.ownerUserId
    : reservation.recipientOrg.ownerUserId
  await notifyUser(otherPartyId, 'RESERVATION_CANCELLED', {
    reservationId: reservation.id,
    listingId: reservation.listingId,
    listingTitle: reservation.listing.title,
    cancelledBy: isRecipientOwner ? 'recipient' : 'provider',
    reason: reason ?? null,
  }, {
    subject: `FreshRelay: reservation cancelled for "${reservation.listing.title}"`,
    body: `The reservation for "${reservation.listing.title}" was cancelled${reason ? `: ${reason}` : ''}. The stock is available again.`,
  })
  await audit(actor.userId, 'RESERVATION_CANCELLED', 'Reservation', reservation.id, { reason: reason ?? null })
}

// ---------------------------------------------------------------------------
// Pickup verification
// ---------------------------------------------------------------------------

export type VerifyResult = { status: 'COLLECTED'; collectedAt: string }

export async function verifyPickup(
  reservationId: string,
  providerUser: { id: string },
  code: string
): Promise<VerifyResult> {
  const reservation = await db.reservation.findUnique({
    where: { id: reservationId },
    include: { listing: { include: { org: { select: { ownerUserId: true, name: true } } } } },
  })
  if (!reservation || reservation.listing.org.ownerUserId !== providerUser.id) {
    throw ApiError.notFound('Reservation not found')
  }

  if (reservation.status === 'LOCKED') {
    throw ApiError.locked('CODE_LOCKED', 'This reservation is locked after too many failed attempts')
  }
  if (reservation.status === 'COLLECTED') {
    throw ApiError.conflict('ALREADY_COLLECTED', 'This reservation was already collected')
  }
  if (!['HELD', 'CONFIRMED'].includes(reservation.status)) {
    throw ApiError.conflict('NOT_VERIFIABLE', `Reservation is ${reservation.status.toLowerCase()} and cannot be verified`)
  }

  if (reservation.failedAttempts >= MAX_VERIFY_ATTEMPTS) {
    await lockReservation(reservation.id)
    throw ApiError.locked('CODE_LOCKED', 'This reservation is locked after too many failed attempts')
  }

  // Code is valid only between pickup slot start and the listing window end.
  const now = new Date()
  const windowEnd = reservation.listing.windowEnd
  if (now < reservation.pickupStart || now > windowEnd) {
    await audit(providerUser.id, 'VERIFY_ATTEMPT', 'Reservation', reservation.id, { outcome: 'outside_window' })
    throw ApiError.unprocessable(
      'CODE_NOT_IN_WINDOW',
      'Codes are only valid between the pickup slot start and the collection window end'
    )
  }

  if (!reservation.codeHash || !safeEqualHex(pickupCodeHash(code), reservation.codeHash)) {
    const attempts = reservation.failedAttempts + 1
    const locked = attempts >= MAX_VERIFY_ATTEMPTS
    await db.reservation.update({
      where: { id: reservation.id },
      data: { failedAttempts: attempts, ...(locked ? { status: 'LOCKED' } : {}) },
    })
    await audit(providerUser.id, 'VERIFY_ATTEMPT', 'Reservation', reservation.id, {
      outcome: locked ? 'locked' : 'invalid_code',
      attempts,
    })
    if (locked) {
      await lockSideEffects(reservation, providerUser.id)
      throw ApiError.locked('CODE_LOCKED', 'Too many failed attempts — this reservation is now locked')
    }
    throw new ApiError(400, 'INVALID_CODE', `Wrong code. ${MAX_VERIFY_ATTEMPTS - attempts} attempt(s) left.`, {
      attemptsLeft: MAX_VERIFY_ATTEMPTS - attempts,
    })
  }

  // Correct code → COLLECTED (single-use, guarded update)
  const collectedAt = new Date()
  const updated = await db.reservation.updateMany({
    where: { id: reservation.id, status: { in: ['HELD', 'CONFIRMED'] } },
    data: { status: 'COLLECTED', collectedAt },
  })
  if (updated.count === 0) {
    throw ApiError.conflict('ALREADY_COLLECTED', 'This reservation was already collected')
  }

  await audit(providerUser.id, 'VERIFY_SUCCESS', 'Reservation', reservation.id, {
    listingId: reservation.listingId,
    quantity: reservation.quantity,
  })
  const ownerId = await recipientOwnerId(reservation.recipientOrgId)
  if (ownerId) {
    await notifyUser(ownerId, 'PICKUP_VERIFIED', {
      reservationId: reservation.id,
      listingId: reservation.listingId,
      listingTitle: reservation.listing.title,
      quantity: reservation.quantity,
      collectedAt: collectedAt.toISOString(),
    }, {
      subject: `FreshRelay: pickup verified for "${reservation.listing.title}"`,
      body: `Your pickup of "${reservation.listing.title}" was verified. Thank you for rescuing food!`,
    })
  }

  return { status: 'COLLECTED', collectedAt: collectedAt.toISOString() }
}

async function lockReservation(reservationId: string): Promise<void> {
  await db.reservation.updateMany({
    where: { id: reservationId, status: { in: ['HELD', 'CONFIRMED'] } },
    data: { status: 'LOCKED' },
  })
}

async function lockSideEffects(
  reservation: { id: string; listingId: string; listing: { title: string; org: { ownerUserId: string } } },
  providerUserId: string
): Promise<void> {
  await notifyUser(providerUserId, 'RESERVATION_LOCKED', {
    reservationId: reservation.id,
    listingTitle: reservation.listing.title,
  }, {
    subject: `FreshRelay: pickup verification locked`,
    body: `Verification for "${reservation.listing.title}" was locked after 5 failed attempts. You may cancel the reservation to restore stock.`,
  })
  const admins = await db.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE' }, select: { id: true } })
  for (const admin of admins) {
    await notifyUser(admin.id, 'RESERVATION_LOCKED', {
      reservationId: reservation.id,
      listingId: reservation.listingId,
      providerUserId,
    })
  }
}

async function recipientOwnerId(orgId: string): Promise<string | null> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { ownerUserId: true } })
  return org?.ownerUserId ?? null
}
