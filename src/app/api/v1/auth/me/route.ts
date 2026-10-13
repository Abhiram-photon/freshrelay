import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireAuth, readJson } from '@/lib/api'
import { accountUpdateSchema } from '@/lib/schemas'
import { ApiError, zodDetails } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { randomBytes } from 'crypto'
import { hashPassword } from '@/lib/password'
import { db } from '@/lib/db'
import { audit } from '@/lib/audit'
import { releaseReservation } from '@/lib/reservations'

function meShape(user: {
  id: string
  email: string
  name: string
  phone: string | null
  role: string
  status: string
  notifyNearby: boolean
}, org: {
  id: string
  name: string
  type: string
  address: string
  lat: number
  lng: number
  verificationStatus: string
  verificationNote: string | null
} | null, unread: number) {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      status: user.status,
      notifyNearby: user.notifyNearby,
    },
    organization: org,
    unreadNotifications: unread,
  }
}

/** GET /api/v1/auth/me — current session + organization + unread count. */
export const GET = routeHandler(async (req: NextRequest) => {
  const ctx = await requireAuth(req)
  const unread = await db.notification.count({ where: { userId: ctx.user.id, readAt: null } })
  const org = ctx.primaryOrg
  return NextResponse.json(
    meShape(
      ctx.user,
      org
        ? {
            id: org.id,
            name: org.name,
            type: org.type,
            address: org.address,
            lat: org.lat,
            lng: org.lng,
            verificationStatus: org.verificationStatus,
            verificationNote: org.verificationNote,
          }
        : null,
      unread
    )
  )
})

/** PATCH /api/v1/auth/me — update notification preferences / phone. */
export const PATCH = routeHandler(async (req: NextRequest) => {
  assertCsrf(req)
  const ctx = await requireAuth(req)
  const parsed = accountUpdateSchema.safeParse(await readJson(req))
  if (!parsed.success) throw ApiError.validation(zodDetails(parsed.error))

  const user = await db.user.update({
    where: { id: ctx.user.id },
    data: {
      ...(parsed.data.notifyNearby !== undefined ? { notifyNearby: parsed.data.notifyNearby } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
    },
  })
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } })
  return NextResponse.json(meShape(user, ctx.primaryOrg, unread))
})

/**
 * DELETE /api/v1/auth/me — account deletion with data minimisation:
 * the user record is anonymized (email/name/password scrambled, sessions
 * revoked, org listings cancelled) while audit/impact aggregates stay intact.
 */
export const DELETE = routeHandler(async (req: NextRequest) => {
  assertCsrf(req)
  const ctx = await requireAuth(req)

  // Cancel this user's live listings (releases their reservations too).
  const listings = await db.listing.findMany({
    where: { org: { ownerUserId: ctx.user.id }, status: { in: ['DRAFT', 'ACTIVE', 'PAUSED', 'RESERVED_OUT'] } },
  })
  for (const listing of listings) {
    const active = await db.reservation.findMany({
      where: { listingId: listing.id, status: { in: ['HELD', 'CONFIRMED'] } },
    })
    for (const reservation of active) {
      await releaseReservation(reservation, 'CANCELLED', 'Provider account deleted')
    }
    await db.listing.update({ where: { id: listing.id }, data: { status: 'CANCELLED' } })
  }

  await db.user.update({
    where: { id: ctx.user.id },
    data: {
      email: `deleted-${ctx.user.id}@anon.invalid`,
      name: 'Deleted user',
      phone: null,
      passwordHash: hashPassword(randomBytes(32).toString('hex')),
      status: 'SUSPENDED',
      notifyNearby: false,
    },
  })
  await db.session.deleteMany({ where: { userId: ctx.user.id } })
  await audit(ctx.user.id, 'ACCOUNT_DELETED', 'User', ctx.user.id, { anonymized: true })

  const res = NextResponse.json({ ok: true, message: 'Account deleted and anonymized' })
  res.cookies.set('fr_session', '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
})
