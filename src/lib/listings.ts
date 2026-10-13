import { db } from './db'
import { approxCoords, bboxForRadius, bestMatchScore, haversineKm } from './geo'
import { sweepExpireListings } from './jobs-worker'
import { Reservation, Listing, Organization } from '@prisma/client'

/**
 * Listing domain service: read-side shaping, expiry-on-read, geospatial search.
 * The spec targets PostGIS (ST_DWithin/ST_Distance); on SQLite we pre-filter
 * with a lat/lng bounding box then compute exact haversine distances in JS.
 */

export type ListingWithOrg = Listing & { org: Organization }

export type ListingDTO = ReturnType<typeof shapeListing>

export function shapeListing(
  listing: ListingWithOrg,
  opts: { exact: boolean; viewerLat?: number | null; viewerLng?: number | null }
) {
  const coords = opts.exact
    ? { lat: listing.lat, lng: listing.lng }
    : approxCoords(listing.lat, listing.lng)
  const distanceKm =
    opts.viewerLat !== undefined &&
    opts.viewerLat !== null &&
    opts.viewerLng !== undefined &&
    opts.viewerLng !== null
      ? Math.round(haversineKm(opts.viewerLat, opts.viewerLng, listing.lat, listing.lng) * 100) / 100
      : null

  let allergens: string[] = []
  try {
    allergens = JSON.parse(listing.allergensJson) as string[]
  } catch {
    allergens = []
  }

  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    category: listing.category,
    quantityTotal: listing.quantityTotal,
    quantityRemaining: listing.quantityRemaining,
    unit: listing.unit,
    allergens,
    storageType: listing.storageType,
    windowStart: listing.windowStart.toISOString(),
    windowEnd: listing.windowEnd.toISOString(),
    expiresAt: listing.expiresAt.toISOString(),
    status: listing.status,
    pickupInstructions: opts.exact ? listing.pickupInstructions : undefined,
    pickupAddress: opts.exact ? listing.pickupAddress : undefined,
    photoUrl: listing.photoUrl || undefined,
    version: listing.version,
    createdAt: listing.createdAt.toISOString(),
    location: { ...coords, approximate: !opts.exact },
    distanceKm,
    org: {
      id: listing.org.id,
      name: listing.org.name,
      type: listing.org.type,
      verificationStatus: listing.org.verificationStatus,
    },
  }
}

export type SearchParams = {
  lat?: number | null
  lng?: number | null
  radiusKm: number
  category?: string
  storage?: string
  q?: string
  timeLeftHours?: number | null
  sort: 'nearest' | 'ending_soon' | 'best_match'
  page: number
  limit: number
}

export type SearchResult = {
  items: ListingDTO[]
  total: number
  page: number
  limit: number
  pages: number
}

export async function searchListings(params: SearchParams): Promise<SearchResult> {
  // Check-on-read: expired listings are never returned, even before the sweeper runs.
  await sweepExpireListings()

  const now = new Date()
  const where: Record<string, unknown> = {
    status: 'ACTIVE',
    windowEnd: { gt: now },
    expiresAt: { gt: now },
    org: { verificationStatus: 'APPROVED', owner: { status: 'ACTIVE' } },
  }

  if (params.category) where.category = params.category
  if (params.storage) where.storageType = params.storage
  if (params.timeLeftHours) {
    where.windowEnd = { gt: now, lte: new Date(now.getTime() + params.timeLeftHours * 3_600_000) }
  }
  if (params.q) {
    where.OR = [
      { title: { contains: params.q } }, // SQLite LIKE is case-insensitive for ASCII
      { description: { contains: params.q } },
    ]
  }

  const hasViewerCoords =
    params.lat !== undefined && params.lat !== null && params.lng !== undefined && params.lng !== null

  if (hasViewerCoords) {
    const bbox = bboxForRadius(params.lat as number, params.lng as number, params.radiusKm)
    where.lat = { gte: bbox.minLat, lte: bbox.maxLat }
    where.lng = { gte: bbox.minLng, lte: bbox.maxLng }
  }

  // v1 scale: result sets are small; fetch the candidate set, filter by exact
  // distance, rank, then paginate in memory (documented in docs/DECISIONS.md).
  const rows = await db.listing.findMany({
    where,
    include: { org: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  let items = rows.map((row) =>
    shapeListing(row, { exact: false, viewerLat: params.lat ?? null, viewerLng: params.lng ?? null })
  )

  if (hasViewerCoords) {
    items = items.filter((i) => i.distanceKm !== null && i.distanceKm <= params.radiusKm)
  }

  if (params.sort === 'nearest') {
    items.sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY))
  } else if (params.sort === 'ending_soon') {
    items.sort((a, b) => new Date(a.windowEnd).getTime() - new Date(b.windowEnd).getTime())
  } else {
    // best match = weighted score of distance and time left (see src/lib/geo.ts)
    items.sort((a, b) => {
      const scoreA = scoreOf(a, params)
      const scoreB = scoreOf(b, params)
      return scoreB - scoreA
    })
  }

  const total = items.length
  const pages = Math.max(1, Math.ceil(total / params.limit))
  const start = (params.page - 1) * params.limit
  return { items: items.slice(start, start + params.limit), total, page: params.page, limit: params.limit, pages }
}

function scoreOf(item: ListingDTO, params: SearchParams): number {
  const hoursLeft = Math.max(0, (new Date(item.windowEnd).getTime() - Date.now()) / 3_600_000)
  return bestMatchScore(item.distanceKm ?? null, hoursLeft, params.radiusKm)
}

/** Loads a listing for a viewer, applying object-level privacy and expiry-on-read. */
export async function getListingForViewer(
  id: string,
  viewer: { id: string; role: string } | null
): Promise<{
  listing: ListingWithOrg | null
  dto: ListingDTO | null
  exact: boolean
}> {
  let listing = await db.listing.findUnique({ where: { id }, include: { org: true } })
  if (!listing) return { listing: null, dto: null, exact: false }

  // Expire-on-read so a stale ACTIVE listing is never served as bookable.
  const now = new Date()
  if (
    ['ACTIVE', 'PAUSED', 'RESERVED_OUT'].includes(listing.status) &&
    (listing.windowEnd <= now || listing.expiresAt <= now)
  ) {
    listing = await db.listing.update({ where: { id: listing.id }, data: { status: 'EXPIRED' }, include: { org: true } })
  }

  const isOwner = viewer ? listing.org.ownerUserId === viewer.id : false
  const isAdmin = viewer?.role === 'ADMIN'
  let hasReservation = false
  if (viewer && viewer.role === 'RECIPIENT' && !isOwner) {
    const org = await db.organization.findFirst({ where: { ownerUserId: viewer.id }, select: { id: true } })
    if (org) {
      const count = await db.reservation.count({
        where: {
          listingId: listing.id,
          recipientOrgId: org.id,
          status: { in: ['HELD', 'CONFIRMED', 'COLLECTED', 'LOCKED'] },
        },
      })
      hasReservation = count > 0
    }
  }
  const exact = isOwner || isAdmin || hasReservation
  const viewerLat = (viewer as { organizations?: Organization[] } | null)?.organizations?.[0]?.lat ?? null
  const viewerLng = (viewer as { organizations?: Organization[] } | null)?.organizations?.[0]?.lng ?? null

  return {
    listing,
    dto: shapeListing(listing, { exact, viewerLat, viewerLng }),
    exact,
  }
}

/** Sum of active (uncollected, uncancelled) reserved quantity for a listing. */
export async function reservedAmount(listingId: string): Promise<number> {
  const result = await db.reservation.aggregate({
    where: { listingId, status: { in: ['HELD', 'CONFIRMED', 'LOCKED'] } },
    _sum: { quantity: true },
  })
  return result._sum.quantity ?? 0
}

export type { Reservation }
