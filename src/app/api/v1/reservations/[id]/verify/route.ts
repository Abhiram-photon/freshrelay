import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, readJson, requireRole, clientIp } from '@/lib/api'
import { verifyCodeSchema } from '@/lib/schemas'
import { ApiError, zodDetails } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { verifyPickup } from '@/lib/reservations'
import { enforceRateLimit } from '@/lib/rate-limit'

type RouteCtx = { params: Promise<{ id: string }> }

/**
 * POST /api/v1/reservations/:id/verify — provider enters the recipient's
 * 6-digit code to mark the reservation COLLECTED. Rate-limited; single-use;
 * locks after 5 failed attempts (with admin + provider notification).
 */
export const POST = routeHandler(async (req: NextRequest, ctx: RouteCtx) => {
  assertCsrf(req)
  const { id } = await ctx.params
  const auth = await requireRole(req, 'PROVIDER')

  await enforceRateLimit(`verify:user:${auth.user.id}`, 10, 5 * 60_000)
  await enforceRateLimit(`verify:ip:${clientIp(req)}`, 20, 5 * 60_000)

  const parsed = verifyCodeSchema.safeParse(await readJson(req, 4_000))
  if (!parsed.success) throw ApiError.validation(zodDetails(parsed.error))

  const result = await verifyPickup(id, { id: auth.user.id }, parsed.data.code)
  return NextResponse.json({ ok: true, ...result })
})
