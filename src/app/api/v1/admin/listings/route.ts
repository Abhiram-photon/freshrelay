import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireRole, numParam } from '@/lib/api'
import { db } from '@/lib/db'

/** GET /api/v1/admin/listings?status&q — moderation queue (ADMIN only). */
export const GET = routeHandler(async (req: NextRequest) => {
  await requireRole(req, 'ADMIN')
  const params = req.nextUrl.searchParams
  const status = params.get('status')?.toUpperCase()
  const q = (params.get('q') ?? '').trim()
  const page = numParam(params, 'page', { min: 1, max: 10_000, default: 1, integer: true }) ?? 1
  const limit = numParam(params, 'limit', { min: 1, max: 100, default: 50, integer: true }) ?? 50

  const where = {
    ...(status ? { status } : {}),
    ...(q ? { title: { contains: q } } : {}),
  }

  const [total, listings] = await Promise.all([
    db.listing.count({ where }),
    db.listing.findMany({
      where,
      include: { org: { select: { id: true, name: true, type: true, verificationStatus: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return NextResponse.json({
    items: listings.map((l) => ({
      id: l.id,
      title: l.title,
      category: l.category,
      status: l.status,
      quantityTotal: l.quantityTotal,
      quantityRemaining: l.quantityRemaining,
      unit: l.unit,
      windowStart: l.windowStart.toISOString(),
      windowEnd: l.windowEnd.toISOString(),
      createdAt: l.createdAt.toISOString(),
      org: l.org,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  })
})
