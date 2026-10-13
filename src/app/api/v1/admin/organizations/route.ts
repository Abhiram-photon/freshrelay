import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireRole, numParam } from '@/lib/api'
import { db } from '@/lib/db'

/** GET /api/v1/admin/organizations?status — verification queue (ADMIN only). */
export const GET = routeHandler(async (req: NextRequest) => {
  await requireRole(req, 'ADMIN')
  const params = req.nextUrl.searchParams
  const status = params.get('status')
  const page = numParam(params, 'page', { min: 1, max: 10_000, default: 1, integer: true }) ?? 1
  const limit = numParam(params, 'limit', { min: 1, max: 100, default: 50, integer: true }) ?? 50

  const where = status ? { verificationStatus: status.toUpperCase() } : {}
  const [total, orgs] = await Promise.all([
    db.organization.count({ where }),
    db.organization.findMany({
      where,
      include: { owner: { select: { id: true, email: true, name: true, status: true } } },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return NextResponse.json({
    items: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      address: o.address,
      lat: o.lat,
      lng: o.lng,
      verificationStatus: o.verificationStatus,
      verificationNote: o.verificationNote,
      createdAt: o.createdAt.toISOString(),
      owner: o.owner,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  })
})
