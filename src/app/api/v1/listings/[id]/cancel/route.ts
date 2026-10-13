import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireAuth } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { releaseReservation } from '@/lib/reservations'
import { notifyUser } from '@/lib/notify'

type RouteCtx = { params: Promise<{ id: string }> }

/**
 * POST /api/v1/listings/:id/cancel — owner-only (admin allowed).
 * Cancelling a listing also cancels its live reservations, restores their
 * stock, and notifies the affected recipients.
 */
export const POST = routeHandler(async (req: NextRequest, ctx: RouteCtx) => {
  assertCsrf(req)
  const { id } = await ctx.params
  const auth = await requireAuth(req)

  const listing = await db.listing.findUnique({ where: { id }, include: { org: true } })
  if (!listing) throw ApiError.notFound('Listing not found')
  if (auth.user.role !== 'ADMIN' && listing.org.ownerUserId !== auth.user.id) {
    throw ApiError.notFound('Listing not found')
  }
  if (!['DRAFT', 'ACTIVE', 'PAUSED', 'RESERVED_OUT'].includes(listing.status)) {
    throw ApiError.conflict('NOT_CANCELLABLE', `A ${listing.status.toLowerCase()} listing cannot be cancelled`)
  }

  const active = await db.reservation.findMany({
    where: { listingId: listing.id, status: { in: ['HELD', 'CONFIRMED'] } },
  })
  for (const reservation of active) {
    await releaseReservation(reservation, 'CANCELLED', 'Listing cancelled by provider')
    const recipientOrg = await db.organization.findUnique({
      where: { id: reservation.recipientOrgId },
      select: { ownerUserId: true },
    })
    if (recipientOrg) {
      await notifyUser(recipientOrg.ownerUserId, 'RESERVATION_CANCELLED', {
        reservationId: reservation.id,
        listingId: listing.id,
        listingTitle: listing.title,
        cancelledBy: 'provider',
        reason: 'Listing cancelled',
      }, {
        subject: `FreshRelay: reservation cancelled — "${listing.title}"`,
        body: `The provider cancelled "${listing.title}", so your reservation was cancelled. Browse FreshRelay for other surplus food.`,
      })
    }
  }

  await db.listing.update({ where: { id: listing.id }, data: { status: 'CANCELLED', version: { increment: 1 } } })
  await audit(auth.user.id, 'LISTING_CANCELLED', 'Listing', listing.id, { releasedReservations: active.length })
  return NextResponse.json({ ok: true, status: 'CANCELLED', releasedReservations: active.length })
})
