import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, readJson, requireAuth } from '@/lib/api'
import { cancelReservationSchema } from '@/lib/schemas'
import { assertCsrf } from '@/lib/session'
import { cancelReservation } from '@/lib/reservations'
import { zodDetails } from '@/lib/errors'

type RouteCtx = { params: Promise<{ id: string }> }

/**
 * DELETE /api/v1/reservations/:id — recipient cancels own reservation, or the
 * provider cancels a reservation on their own listing (with reason).
 * Cancellation restores stock; a RESERVED_OUT listing returns to ACTIVE.
 */
export const DELETE = routeHandler(async (req: NextRequest, ctx: RouteCtx) => {
  assertCsrf(req)
  const { id } = await ctx.params
  const auth = await requireAuth(req)

  let reason: string | undefined
  try {
    const parsed = cancelReservationSchema.safeParse(await readJson(req, 4_000))
    if (parsed.success) reason = parsed.data.reason || undefined
  } catch {
    reason = undefined
  }

  await cancelReservation(id, { userId: auth.user.id, role: auth.user.role }, reason)
  return NextResponse.json({ ok: true })
})
