import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireRole, numParam } from '@/lib/api'
import { db } from '@/lib/db'
import { sweepExpireListings } from '@/lib/jobs-worker'

/**
 * GET /api/v1/me/listings — the provider's own listings (all statuses) with
 * counts of live reservations per listing.
 */
export const GET = routeHandler(async (req: NextRequest) => {
  const auth = await requireRole(req, 'PROVIDER')
  await sweepExpireListings()

  const page = numParam(req.nextUrl.searchParams, 'page', { min: 1, max: 10_000, default: 1, integer: true }) ?? 1
  const limit = numParam(req.nextUrl.searchParams, 'limit', { min: 1, max: 50, default: 50, integer: true }) ?? 50

  const orgIds = auth.user.organizations.map((o) => o.id)
  const [total, listings] = await Promise.all([
    db.listing.count({ where: { orgId: { in: orgIds } } }),
    db.listing.findMany({
      where: { orgId: { in: orgIds } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  const items = await Promise.all(
    listings.map(async (listing) => {
      const liveReservations = await db.reservation.count({
        where: { listingId: listing.id, status: { in: ['HELD', 'CONFIRMED'] } },
      })
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
        pickupAddress: listing.pickupAddress,
        windowStart: listing.windowStart.toISOString(),
        windowEnd: listing.windowEnd.toISOString(),
        expiresAt: listing.expiresAt.toISOString(),
        status: listing.status,
        version: listing.version,
        photoUrl: listing.photoUrl || undefined,
        pickupInstructions: listing.pickupInstructions || undefined,
        liveReservations,
        createdAt: listing.createdAt.toISOString(),
      }
    })
  )

  return NextResponse.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) })
})
