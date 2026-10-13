import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireRole } from '@/lib/api'
import { db } from '@/lib/db'

/**
 * GET /api/v1/me/reservations — the recipient's own reservations with listing
 * summary. The pickup code is delivered via the RESERVATION_CONFIRMED
 * notification (only its hash is stored here); upcoming reservations join the
 * latest such notification so the UI can always show the code.
 */
export const GET = routeHandler(async (req: NextRequest) => {
  const auth = await requireRole(req, 'RECIPIENT')
  const orgIds = auth.user.organizations.map((o) => o.id)

  const reservations = await db.reservation.findMany({
    where: { recipientOrgId: { in: orgIds } },
    include: {
      listing: {
        select: {
          id: true,
          title: true,
          category: true,
          unit: true,
          storageType: true,
          photoUrl: true,
          pickupAddress: true,
          pickupInstructions: true,
          windowStart: true,
          windowEnd: true,
          status: true,
          org: { select: { id: true, name: true, type: true, lat: true, lng: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  const items = await Promise.all(
    reservations.map(async (r) => {
      const codeNotification = await db.notification.findFirst({
        where: {
          userId: auth.user.id,
          type: 'RESERVATION_CONFIRMED',
          payloadJson: { contains: `"reservationId":"${r.id}"` },
        },
        orderBy: { createdAt: 'desc' },
      })
      let code: string | undefined
      if (codeNotification) {
        try {
          code = (JSON.parse(codeNotification.payloadJson) as { code?: string }).code
        } catch {
          code = undefined
        }
      }
      return {
        id: r.id,
        listing: {
          id: r.listing.id,
          title: r.listing.title,
          category: r.listing.category,
          unit: r.listing.unit,
          storageType: r.listing.storageType,
          photoUrl: r.listing.photoUrl || undefined,
          pickupAddress: r.listing.pickupAddress,
          pickupInstructions: r.listing.pickupInstructions || undefined,
          windowStart: r.listing.windowStart.toISOString(),
          windowEnd: r.listing.windowEnd.toISOString(),
          status: r.listing.status,
          orgName: r.listing.org.name,
          orgType: r.listing.org.type,
        },
        quantity: r.quantity,
        pickupStart: r.pickupStart.toISOString(),
        pickupEnd: r.pickupEnd.toISOString(),
        status: r.status,
        failedAttempts: r.failedAttempts,
        code,
        cancelReason: r.cancelReason || undefined,
        collectedAt: r.collectedAt?.toISOString(),
        createdAt: r.createdAt.toISOString(),
      }
    })
  )

  return NextResponse.json({ items, total: items.length })
})
