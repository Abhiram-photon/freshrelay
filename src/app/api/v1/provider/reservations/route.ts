import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireRole } from '@/lib/api'
import { db } from '@/lib/db'

/**
 * GET /api/v1/provider/reservations?listing_id&status
 * Reservations on the provider's own listings (object-level scoping).
 */
export const GET = routeHandler(async (req: NextRequest) => {
  const auth = await requireRole(req, 'PROVIDER')
  const params = req.nextUrl.searchParams
  const listingId = params.get('listing_id') || undefined
  const status = params.get('status') || undefined

  const orgIds = auth.user.organizations.map((o) => o.id)
  const reservations = await db.reservation.findMany({
    where: {
      listing: { orgId: { in: orgIds }, ...(listingId ? { id: listingId } : {}) },
      ...(status ? { status } : {}),
    },
    include: {
      listing: { select: { id: true, title: true, unit: true, windowEnd: true, status: true } },
      recipientOrg: { select: { id: true, name: true, type: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const items = reservations.map((r) => ({
    id: r.id,
    listing: {
      id: r.listing.id,
      title: r.listing.title,
      unit: r.listing.unit,
      windowEnd: r.listing.windowEnd.toISOString(),
      status: r.listing.status,
    },
    recipientOrg: { id: r.recipientOrg.id, name: r.recipientOrg.name, type: r.recipientOrg.type },
    quantity: r.quantity,
    pickupStart: r.pickupStart.toISOString(),
    pickupEnd: r.pickupEnd.toISOString(),
    status: r.status,
    failedAttempts: r.failedAttempts,
    cancelReason: r.cancelReason || undefined,
    collectedAt: r.collectedAt?.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }))

  return NextResponse.json({ items, total: items.length })
})
