import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireAuth, numParam } from '@/lib/api'
import { db } from '@/lib/db'

/** GET /api/v1/notifications — in-app notification center feed. */
export const GET = routeHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req)
  const params = req.nextUrl.searchParams
  const page = numParam(params, 'page', { min: 1, max: 10_000, default: 1, integer: true }) ?? 1
  const limit = numParam(params, 'limit', { min: 1, max: 100, default: 30, integer: true }) ?? 30
  const unreadOnly = params.get('unread') === 'true'

  const where = { userId: auth.user.id, ...(unreadOnly ? { readAt: null } : {}) }
  const [total, unread, notifications] = await Promise.all([
    db.notification.count({ where }),
    db.notification.count({ where: { userId: auth.user.id, readAt: null } }),
    db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return NextResponse.json({
    items: notifications.map((n) => {
      let payload: Record<string, unknown> = {}
      try {
        payload = JSON.parse(n.payloadJson) as Record<string, unknown>
      } catch {
        payload = {}
      }
      return {
        id: n.id,
        type: n.type,
        payload,
        read: n.readAt !== null,
        readAt: n.readAt?.toISOString(),
        createdAt: n.createdAt.toISOString(),
      }
    }),
    total,
    unread,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  })
})
