import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, readJson, requireRole, requireApprovedOrg, clientIp } from '@/lib/api'
import { reservationCreateSchema } from '@/lib/schemas'
import { ApiError, zodDetails } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { createReservation } from '@/lib/reservations'
import { enforceRateLimit } from '@/lib/rate-limit'

type RouteCtx = { params: Promise<{ id: string }> }

/**
 * POST /api/v1/listings/:id/reservations
 * Recipients with an APPROVED organization only. Quantity must be ≥ 1 and
 * ≤ quantity_remaining; the pickup slot must fit inside the collection window.
 * Stock is decremented atomically — overselling is impossible.
 */
export const POST = routeHandler(async (req: NextRequest, ctx: RouteCtx) => {
  assertCsrf(req)
  const { id } = await ctx.params
  const auth = await requireRole(req, 'RECIPIENT')
  const org = requireApprovedOrg(auth)
  await enforceRateLimit(`reserve:user:${auth.user.id}`, 20, 3_600_000)
  await enforceRateLimit(`reserve:ip:${clientIp(req)}`, 40, 3_600_000)

  const parsed = reservationCreateSchema.safeParse(await readJson(req))
  if (!parsed.success) throw ApiError.validation(zodDetails(parsed.error))
  const input = parsed.data

  const result = await createReservation({
    listingId: id,
    recipientUserId: auth.user.id,
    recipientOrgId: org.id,
    recipientOrgName: org.name,
    quantity: input.quantity,
    pickupStart: new Date(input.pickupStart),
    pickupEnd: new Date(input.pickupEnd),
  })

  return NextResponse.json(
    {
      reservation: {
        id: result.reservationId,
        status: 'CONFIRMED',
        code: result.code,
      },
      message: 'Reservation confirmed. Show the 6-digit code at pickup.',
    },
    { status: 201 }
  )
})
