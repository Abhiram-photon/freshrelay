import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireAuth } from '@/lib/api'
import { assertCsrf } from '@/lib/session'
import { db } from '@/lib/db'

/** POST /api/v1/notifications/read-all — mark every notification as read. */
export const POST = routeHandler(async (req: NextRequest) => {
  assertCsrf(req)
  const auth = await requireAuth(req)
  const result = await db.notification.updateMany({
    where: { userId: auth.user.id, readAt: null },
    data: { readAt: new Date() },
  })
  return NextResponse.json({ ok: true, marked: result.count })
})
