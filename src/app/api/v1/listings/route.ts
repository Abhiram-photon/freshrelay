import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, readJson, numParam, clientIp, requireRole, getAuth } from '@/lib/api'
import { listingCreateSchema } from '@/lib/schemas'
import { ApiError, zodDetails } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { db } from '@/lib/db'
import { searchListings } from '@/lib/listings'
import { enforceRateLimit } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'
import { CATEGORIES, STORAGE_TYPES } from '@/lib/units'
import { notifyUser } from '@/lib/notify'
import { enqueueJob } from '@/lib/jobs'
import { haversineKm } from '@/lib/geo'

export const SORTS = ['nearest', 'ending_soon', 'best_match'] as const
export const TIME_LEFT = { '1h': 1, '3h': 3, '6h': 6, '24h': 24 } as Record<string, number>

/**
 * GET /api/v1/listings — public browse/search.
 * ACTIVE + non-expired + approved-provider listings only; approximate
 * location (~500 m) in public responses; sorted by nearest / ending_soon /
 * best_match (weighted score, see src/lib/geo.ts).
 */
export const GET = routeHandler(async (req: NextRequest) => {
  await enforceRateLimit(`search:ip:${clientIp(req)}`, 120, 60_000)
  const params = req.nextUrl.searchParams

  const ctx = await getAuth(req)
  const viewerOrg = ctx?.primaryOrg ?? null

  const lat = numParam(params, 'lat', { min: -90, max: 90 })
  const lng = numParam(params, 'lng', { min: -180, max: 180 })
  const viewerLat = lat ?? viewerOrg?.lat ?? null
  const viewerLng = lng ?? viewerOrg?.lng ?? null

  const radiusKm = numParam(params, 'radius_km', { min: 1, max: 50, default: 5 }) ?? 5
  const categoryRaw = params.get('category') ?? undefined
  const storageRaw = params.get('storage') ?? undefined
  const category = categoryRaw && (CATEGORIES as readonly string[]).includes(categoryRaw) ? categoryRaw : undefined
  const storage = storageRaw && (STORAGE_TYPES as readonly string[]).includes(storageRaw) ? storageRaw : undefined
  const q = (params.get('q') ?? '').slice(0, 100) || undefined
  const sortRaw = params.get('sort') ?? 'best_match'
  const sort = (SORTS as readonly string[]).includes(sortRaw) ? sortRaw : 'best_match'
  const timeLeftRaw = params.get('time_left')
  const timeLeftHours = timeLeftRaw && TIME_LEFT[timeLeftRaw] ? TIME_LEFT[timeLeftRaw] : null
  const page = numParam(params, 'page', { min: 1, max: 10_000, default: 1, integer: true }) ?? 1
  const limit = numParam(params, 'limit', { min: 1, max: 50, default: 20, integer: true }) ?? 20

  const result = await searchListings({
    lat: viewerLat,
    lng: viewerLng,
    radiusKm,
    category,
    storage,
    q,
    timeLeftHours,
    sort: sort as 'nearest' | 'ending_soon' | 'best_match',
    page,
    limit,
  })

  return NextResponse.json({
    items: result.items,
    total: result.total,
    page: result.page,
    pages: result.pages,
    viewerLocation: viewerLat !== null && viewerLng !== null ? { lat: viewerLat, lng: viewerLng } : null,
  })
})

/**
 * POST /api/v1/listings — create a listing.
 * Pending providers may create DRAFTs; only APPROVED organizations can publish.
 */
export const POST = routeHandler(async (req: NextRequest) => {
  assertCsrf(req)
  const ctx = await requireRole(req, 'PROVIDER')
  await enforceRateLimit(`listing-create:user:${ctx.user.id}`, 30, 3_600_000)

  const parsed = listingCreateSchema.safeParse(await readJson(req))
  if (!parsed.success) throw ApiError.validation(zodDetails(parsed.error))
  const input = parsed.data

  const now = Date.now()
  if (new Date(input.windowEnd).getTime() <= now) {
    throw ApiError.unprocessable('WINDOW_IN_PAST', 'The collection window end must be in the future')
  }

  const publish = input.publish === true
  if (publish && ctx.primaryOrg?.verificationStatus !== 'APPROVED') {
    throw ApiError.forbidden('Your organization must be approved before publishing listings. Save as draft instead.')
  }

  const expiresAt = input.expiresAt
    ? new Date(Math.min(new Date(input.expiresAt).getTime(), new Date(input.windowEnd).getTime()))
    : new Date(input.windowEnd)

  const windowEnd = new Date(input.windowEnd)
  const listing = await db.listing.create({
    data: {
      orgId: ctx.primaryOrg!.id,
      title: input.title.trim(),
      description: input.description.trim(),
      category: input.category,
      quantityTotal: input.quantityTotal,
      quantityRemaining: input.quantityTotal,
      unit: input.unit,
      allergensJson: JSON.stringify(input.allergens ?? []),
      storageType: input.storageType,
      pickupAddress: input.pickupAddress.trim(),
      lat: input.lat,
      lng: input.lng,
      windowStart: new Date(input.windowStart),
      windowEnd,
      expiresAt,
      pickupInstructions: input.pickupInstructions?.trim() || null,
      photoUrl: input.photoUrl?.trim() || null,
      status: publish ? 'ACTIVE' : 'DRAFT',
    },
    include: { org: true },
  })

  await audit(ctx.user.id, 'LISTING_CREATED', 'Listing', listing.id, { status: listing.status, publish })

  if (publish) {
    await fanOutNewListing(listing.id)
  }

  return NextResponse.json({ listing: { id: listing.id, status: listing.status } }, { status: 201 })
})

/** In-app "new nearby listing" notifications + rate-limited email digest jobs. */
async function fanOutNewListing(listingId: string): Promise<void> {
  const listing = await db.listing.findUnique({ where: { id: listingId }, include: { org: true } })
  if (!listing) return
  const recipients = await db.organization.findMany({
    where: {
      type: { in: ['FOOD_BANK', 'CHARITY', 'SHELTER', 'COMMUNITY_KITCHEN'] },
      verificationStatus: 'APPROVED',
      owner: { status: 'ACTIVE', role: 'RECIPIENT', notifyNearby: true },
    },
    include: { owner: true },
  })
  for (const org of recipients) {
    const distanceKm = Math.round(haversineKm(org.lat, org.lng, listing.lat, listing.lng) * 10) / 10
    if (distanceKm > 5) continue
    await notifyUser(org.ownerUserId, 'NEW_NEARBY_LISTING', {
      listingId: listing.id,
      title: listing.title,
      category: listing.category,
      quantity: listing.quantityTotal,
      unit: listing.unit,
      distanceKm,
    })
    await enqueueJob('DIGEST', { userId: org.ownerUserId })
  }
}
