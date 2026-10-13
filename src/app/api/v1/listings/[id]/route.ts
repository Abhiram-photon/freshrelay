import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, readJson, getAuth, requireAuth } from '@/lib/api'
import { listingPatchSchema } from '@/lib/schemas'
import { ApiError, zodDetails } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { db } from '@/lib/db'
import { getListingForViewer } from '@/lib/listings'
import { audit } from '@/lib/audit'

type RouteCtx = { params: Promise<{ id: string }> }

/**
 * GET /api/v1/listings/:id — full details for the owner or a confirmed
 * recipient; approximate location otherwise. Returns 404 for unknown ids.
 */
export const GET = routeHandler(async (req: NextRequest, ctx: RouteCtx) => {
  const { id } = await ctx.params
  const viewer = await getAuth(req)
  const { listing, dto, exact } = await getListingForViewer(id, viewer ? { id: viewer.user.id, role: viewer.user.role } : null)
  if (!listing || !dto) throw ApiError.notFound('Listing not found')

  const isOwner = viewer ? listing.org.ownerUserId === viewer.user.id : false
  return NextResponse.json({ listing: dto, exact, isOwner })
})

/**
 * PATCH /api/v1/listings/:id — owner-only edits.
 * Rejects changes that would drop quantity below the already-reserved amount,
 * and conflicting version numbers (optimistic locking).
 */
export const PATCH = routeHandler(async (req: NextRequest, ctx: RouteCtx) => {
  assertCsrf(req)
  const { id } = await ctx.params
  const auth = await requireAuth(req)

  const listing = await db.listing.findUnique({ where: { id }, include: { org: true } })
  if (!listing || listing.org.ownerUserId !== auth.user.id) throw ApiError.notFound('Listing not found')
  if (!['DRAFT', 'ACTIVE', 'PAUSED', 'RESERVED_OUT'].includes(listing.status)) {
    throw ApiError.conflict('NOT_EDITABLE', `A ${listing.status.toLowerCase()} listing cannot be edited`)
  }

  const parsed = listingPatchSchema.safeParse(await readJson(req))
  if (!parsed.success) throw ApiError.validation(zodDetails(parsed.error))
  const input = parsed.data

  if (input.version !== undefined && input.version !== listing.version) {
    throw ApiError.conflict('VERSION_CONFLICT', 'This listing was modified by someone else. Reload and retry.')
  }

  // Merge window fields, then validate
  const windowStart = input.windowStart ? new Date(input.windowStart) : listing.windowStart
  const windowEnd = input.windowEnd ? new Date(input.windowEnd) : listing.windowEnd
  if (windowEnd <= windowStart) {
    throw ApiError.unprocessable('WINDOW_INVALID', 'Collection window end must be after start')
  }
  const now = new Date()
  if (listing.status !== 'DRAFT' && windowEnd <= now) {
    throw ApiError.unprocessable('WINDOW_IN_PAST', 'Collection window end must be in the future')
  }
  const expiresAt = input.expiresAt
    ? new Date(input.expiresAt)
    : listing.expiresAt

  // Quantity rule: new total must cover everything already taken/reserved.
  // consumed = old total − old remaining (reserved + collected amounts)
  let quantityTotal = input.quantityTotal ?? listing.quantityTotal
  const consumed = listing.quantityTotal - listing.quantityRemaining
  if (quantityTotal < consumed) {
    throw ApiError.unprocessable(
      'QUANTITY_BELOW_RESERVED',
      `Quantity cannot be reduced below the already-reserved amount (${consumed} ${listing.unit})`
    )
  }
  const quantityRemaining = quantityTotal - consumed

  const publish = input.publish === true
  if (publish && auth.primaryOrg?.verificationStatus !== 'APPROVED') {
    throw ApiError.forbidden('Your organization must be approved before publishing listings')
  }

  let nextStatus = listing.status
  if (publish && listing.status === 'DRAFT') nextStatus = 'ACTIVE'
  if (publish && listing.status === 'PAUSED') nextStatus = 'ACTIVE'
  if (quantityRemaining <= 0 && ['ACTIVE', 'RESERVED_OUT'].includes(nextStatus)) nextStatus = 'RESERVED_OUT'

  const updated = await db.listing.update({
    where: { id: listing.id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      quantityTotal,
      quantityRemaining,
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.allergens !== undefined ? { allergensJson: JSON.stringify(input.allergens) } : {}),
      ...(input.storageType !== undefined ? { storageType: input.storageType } : {}),
      ...(input.pickupAddress !== undefined ? { pickupAddress: input.pickupAddress.trim() } : {}),
      ...(input.lat !== undefined ? { lat: input.lat } : {}),
      ...(input.lng !== undefined ? { lng: input.lng } : {}),
      windowStart,
      windowEnd,
      expiresAt,
      ...(input.pickupInstructions !== undefined ? { pickupInstructions: input.pickupInstructions || null } : {}),
      ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl || null } : {}),
      status: nextStatus,
      version: { increment: 1 },
    },
    include: { org: true },
  })

  await audit(auth.user.id, 'LISTING_UPDATED', 'Listing', listing.id, { status: nextStatus })
  return NextResponse.json({ listing: { id: updated.id, status: updated.status, version: updated.version } })
})
