import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireRole } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

type RouteCtx = { params: Promise<{ id: string }> }

/** POST /api/v1/listings/:id/resume — owner-only. */
export const POST = routeHandler(async (req: NextRequest, ctx: RouteCtx) => {
  assertCsrf(req)
  const { id } = await ctx.params
  const auth = await requireRole(req, 'PROVIDER')

  const listing = await db.listing.findUnique({ where: { id }, include: { org: true } })
  if (!listing || listing.org.ownerUserId !== auth.user.id) throw ApiError.notFound('Listing not found')
  if (listing.status !== 'PAUSED') {
    throw ApiError.conflict('NOT_PAUSED', 'Only a paused listing can be resumed')
  }
  const now = new Date()
  if (listing.windowEnd <= now || listing.expiresAt <= now) {
    throw ApiError.unprocessable('WINDOW_CLOSED', 'The collection window has closed — this listing cannot be resumed')
  }
  const status = listing.quantityRemaining <= 0 ? 'RESERVED_OUT' : 'ACTIVE'
  await db.listing.update({ where: { id: listing.id }, data: { status, version: { increment: 1 } } })
  await audit(auth.user.id, 'LISTING_RESUMED', 'Listing', listing.id, { status })
  return NextResponse.json({ ok: true, status })
})
