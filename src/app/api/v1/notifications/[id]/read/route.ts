import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireAuth } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { db } from '@/lib/db'

type RouteCtx = { params: Promise<{ id: string }> }

/** POST /api/v1/notifications/:id/read — owner-only mark-as-read. */
export const POST = routeHandler(async (req: NextRequest, ctx: RouteCtx) => {
  assertCsrf(req)
  const { id } = await ctx.params
  const auth = await requireAuth(req)

  const notification = await db.notification.findUnique({ where: { id } })
  if (!notification || notification.userId !== auth.user.id) {
    throw ApiError.notFound('Notification not found')
  }
  if (notification.readAt === null) {
    await db.notification.update({ where: { id }, data: { readAt: new Date() } })
  }
  return NextResponse.json({ ok: true })
})
