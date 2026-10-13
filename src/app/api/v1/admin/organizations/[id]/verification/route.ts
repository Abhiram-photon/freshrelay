import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, readJson, requireRole } from '@/lib/api'
import { orgVerificationSchema } from '@/lib/schemas'
import { ApiError, zodDetails } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { db } from '@/lib/db'
import { notifyUser } from '@/lib/notify'
import { audit } from '@/lib/audit'

type RouteCtx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/v1/admin/organizations/:id/verification — approve or reject with
 * an optional note. Decisions notify the owner (in-app + email) and are
 * recorded in the audit log.
 */
export const PATCH = routeHandler(async (req: NextRequest, ctx: RouteCtx) => {
  assertCsrf(req)
  const { id } = await ctx.params
  const auth = await requireRole(req, 'ADMIN')

  const parsed = orgVerificationSchema.safeParse(await readJson(req))
  if (!parsed.success) throw ApiError.validation(zodDetails(parsed.error))
  const { decision, note } = parsed.data

  const org = await db.organization.findUnique({ where: { id } })
  if (!org) throw ApiError.notFound('Organization not found')

  const updated = await db.organization.update({
    where: { id },
    data: {
      verificationStatus: decision,
      verificationNote: note?.trim() || null,
    },
  })

  await notifyUser(org.ownerUserId, decision === 'APPROVED' ? 'ORG_APPROVED' : 'ORG_REJECTED', {
    organizationId: org.id,
    organizationName: org.name,
    decision,
    note: note ?? null,
  }, {
    subject: `FreshRelay: your organization was ${decision.toLowerCase()}`,
    body:
      decision === 'APPROVED'
        ? `Good news — "${org.name}" is approved. You can now ${org.type === 'HOUSEHOLD' || ['BAKERY', 'GROCERY', 'CATERER', 'RESTAURANT'].includes(org.type) ? 'publish surplus food listings' : 'reserve surplus food'}.`
        : `"${org.name}" was rejected.${note ? ` Note from the admin: ${note}` : ''}`,
  })
  await audit(auth.user.id, decision === 'APPROVED' ? 'ORG_APPROVED' : 'ORG_REJECTED', 'Organization', id, {
    organizationName: org.name,
    note: note ?? null,
  })

  return NextResponse.json({ ok: true, verificationStatus: updated.verificationStatus })
})
