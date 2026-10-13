import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, readJson, requireRole } from '@/lib/api'
import { moderationSchema } from '@/lib/schemas'
import { ApiError, zodDetails } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { db } from '@/lib/db'
import { notifyUser } from '@/lib/notify'
import { audit } from '@/lib/audit'

type RouteCtx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/v1/admin/listings/:id/moderation — hide or restore a listing.
 * Hidden listings never appear in search; existing reservations are unaffected.
 */
export const PATCH = routeHandler(async (req: NextRequest, ctx: RouteCtx) => {
  assertCsrf(req)
  const { id } = await ctx.params
  const auth = await requireRole(req, 'ADMIN')

  const parsed = moderationSchema.safeParse(await readJson(req))
  if (!parsed.success) throw ApiError.validation(zodDetails(parsed.error))

  const listing = await db.listing.findUnique({ where: { id }, include: { org: true } })
  if (!listing) throw ApiError.notFound('Listing not found')

  const now = new Date()
  let nextStatus: string
  if (parsed.data.action === 'HIDE') {
    if (['CANCELLED', 'HIDDEN'].includes(listing.status)) {
      throw ApiError.conflict('NOT_HIDABLE', `A ${listing.status.toLowerCase()} listing cannot be hidden`)
    }
    nextStatus = 'HIDDEN'
  } else {
    if (listing.status !== 'HIDDEN') {
      throw ApiError.conflict('NOT_HIDDEN', 'This listing is not hidden')
    }
    nextStatus =
      listing.windowEnd <= now || listing.expiresAt <= now
        ? 'EXPIRED'
        : listing.quantityRemaining <= 0
          ? 'RESERVED_OUT'
          : 'ACTIVE'
  }

  await db.listing.update({ where: { id }, data: { status: nextStatus, version: { increment: 1 } } })

  await notifyUser(listing.org.ownerUserId, 'ACCOUNT_STATUS', {
    kind: 'LISTING_MODERATED',
    listingId: listing.id,
    listingTitle: listing.title,
    action: parsed.data.action,
  }, {
    subject: `FreshRelay: your listing "${listing.title}" was ${parsed.data.action === 'HIDE' ? 'hidden' : 'restored'} by a moderator`,
    body:
      parsed.data.action === 'HIDE'
        ? `Your listing "${listing.title}" was hidden from the platform by a moderator. Contact support for details.`
        : `Your listing "${listing.title}" has been restored.`,
  })
  await audit(auth.user.id, parsed.data.action === 'HIDE' ? 'LISTING_HIDDEN' : 'LISTING_RESTORED', 'Listing', id, {})

  return NextResponse.json({ ok: true, status: nextStatus })
})
