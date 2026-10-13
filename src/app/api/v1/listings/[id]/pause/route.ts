import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireRole } from '@/lib/api'
import { ApiError } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'

type RouteCtx = { params: Promise<{ id: string }> }

/** POST /api/v1/listings/:id/pause — owner-only. */
export const POST = routeHandler(async (req: NextRequest, ctx: RouteCtx) => {
  assertCsrf(req)
  const { id } = await ctx.params
  const auth = await requireRole(req, 'PROVIDER')

  const listing = await db.listing.findUnique({ where: { id }, include: { org: true } })
  if (!listing || listing.org.ownerUserId !== auth.user.id) throw ApiError.notFound('Listing not found')
  if (!['ACTIVE', 'RESERVED_OUT'].includes(listing.status)) {
    throw ApiError.conflict('NOT_PAUSABLE', `A ${listing.status.toLowerCase()} listing cannot be paused`)
  }

  await db.listing.update({ where: { id: listing.id }, data: { status: 'PAUSED', version: { increment: 1 } } })
  await audit(auth.user.id, 'LISTING_PAUSED', 'Listing', listing.id, {})
  return NextResponse.json({ ok: true, status: 'PAUSED' })
})
