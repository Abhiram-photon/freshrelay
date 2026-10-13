import { NextRequest, NextResponse } from 'next/server'
import { routeHandler } from '@/lib/api'
import { assertCsrf, clearSessionCookie, destroySession } from '@/lib/session'

/** POST /api/v1/auth/logout — revokes the session server-side and clears the cookie. */
export const POST = routeHandler(async (req: NextRequest) => {
  assertCsrf(req)
  await destroySession(req)
  const res = NextResponse.json({ ok: true })
  clearSessionCookie(res)
  return res
})
