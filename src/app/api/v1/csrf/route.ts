import { NextRequest, NextResponse } from 'next/server'
import { routeHandler } from '@/lib/api'
import { ensureCsrfToken } from '@/lib/session'

/** Issues (or echoes) the CSRF token used for double-submit protection. */
export const GET = routeHandler(async (req: NextRequest) => {
  const res = NextResponse.json({ ok: true })
  const token = ensureCsrfToken(req, res)
  return NextResponse.json({ token }, { headers: res.headers })
})
