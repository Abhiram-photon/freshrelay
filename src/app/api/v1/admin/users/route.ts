import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireRole, numParam } from '@/lib/api'
import { db } from '@/lib/db'

/** GET /api/v1/admin/users?q — user management list (ADMIN only). */
export const GET = routeHandler(async (req: NextRequest) => {
  await requireRole(req, 'ADMIN')
  const params = req.nextUrl.searchParams
  const q = (params.get('q') ?? '').trim()
  const page = numParam(params, 'page', { min: 1, max: 10_000, default: 1, integer: true }) ?? 1
  const limit = numParam(params, 'limit', { min: 1, max: 100, default: 50, integer: true }) ?? 50

  const where = q
    ? {
        OR: [
          { email: { contains: q } },
          { name: { contains: q } },
        ],
      }
    : {}

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      include: { organizations: { select: { id: true, name: true, type: true, verificationStatus: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return NextResponse.json({
    items: users.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt.toISOString(),
      organizations: u.organizations,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  })
})
