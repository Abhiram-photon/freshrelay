import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, readJson, requireRole } from '@/lib/api'
import { userStatusSchema } from '@/lib/schemas'
import { ApiError, zodDetails } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { db } from '@/lib/db'
import { notifyUser } from '@/lib/notify'
import { audit } from '@/lib/audit'

type RouteCtx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/v1/admin/users/:id/status — activate or suspend a user.
 * Suspension immediately revokes sessions and hides their listings from search.
 */
export const PATCH = routeHandler(async (req: NextRequest, ctx: RouteCtx) => {
  assertCsrf(req)
  const { id } = await ctx.params
  const auth = await requireRole(req, 'ADMIN')

  if (id === auth.user.id) {
    throw ApiError.unprocessable('CANNOT_SUSPEND_SELF', 'You cannot change your own status')
  }

  const parsed = userStatusSchema.safeParse(await readJson(req))
  if (!parsed.success) throw ApiError.validation(zodDetails(parsed.error))

  const user = await db.user.findUnique({ where: { id } })
  if (!user) throw ApiError.notFound('User not found')

  await db.user.update({ where: { id }, data: { status: parsed.data.status } })
  if (parsed.data.status === 'SUSPENDED') {
    await db.session.deleteMany({ where: { userId: id } })
  }

  await notifyUser(id, 'ACCOUNT_STATUS', { status: parsed.data.status }, {
    subject: `FreshRelay: account ${parsed.data.status === 'ACTIVE' ? 'reactivated' : 'suspended'}`,
    body:
      parsed.data.status === 'ACTIVE'
        ? 'Your FreshRelay account has been reactivated.'
        : 'Your FreshRelay account has been suspended. Contact an administrator for details.',
  })
  await audit(auth.user.id, parsed.data.status === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_SUSPENDED', 'User', id, {})

  return NextResponse.json({ ok: true, status: parsed.data.status })
})
