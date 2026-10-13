import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, readJson, clientIp } from '@/lib/api'
import { passwordResetConfirmSchema } from '@/lib/schemas'
import { ApiError, zodDetails } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { sha256 } from '@/lib/tokens'
import { hashPassword } from '@/lib/password'
import { db } from '@/lib/db'
import { enforceRateLimit } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'

/** POST /api/v1/auth/password-reset/confirm — single-use token → new password. */
export const POST = routeHandler(async (req: NextRequest) => {
  assertCsrf(req)
  await enforceRateLimit(`pwconfirm:ip:${clientIp(req)}`, 10, 3_600_000)

  const parsed = passwordResetConfirmSchema.safeParse(await readJson(req))
  if (!parsed.success) throw ApiError.validation(zodDetails(parsed.error))

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: sha256(parsed.data.token) },
  })
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw ApiError.unprocessable('TOKEN_INVALID', 'This reset token is invalid, used, or expired')
  }

  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash: hashPassword(parsed.data.password) } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.session.deleteMany({ where: { userId: record.userId } }), // force re-login everywhere
  ])
  await audit(record.userId, 'PASSWORD_RESET_COMPLETED', 'User', record.userId, {})

  return NextResponse.json({ ok: true, message: 'Password updated. Please log in again.' })
})
