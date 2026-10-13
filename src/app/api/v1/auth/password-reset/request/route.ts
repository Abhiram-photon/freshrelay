import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, readJson, clientIp } from '@/lib/api'
import { passwordResetRequestSchema } from '@/lib/schemas'
import { ApiError, zodDetails } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { randomToken, sha256 } from '@/lib/tokens'
import { RESET_TOKEN_MINUTES } from '@/lib/config'
import { db } from '@/lib/db'
import { enqueueJob } from '@/lib/jobs'
import { enforceRateLimit } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'

/**
 * POST /api/v1/auth/password-reset/request
 * Always returns 200 (no user enumeration). The reset token is emailed via
 * the job queue; only its SHA-256 hash is stored. Expires in 30 minutes.
 * In development the response includes devToken so the demo works without a mailbox.
 */
export const POST = routeHandler(async (req: NextRequest) => {
  assertCsrf(req)
  await enforceRateLimit(`pwreset:ip:${clientIp(req)}`, 5, 3_600_000)

  const parsed = passwordResetRequestSchema.safeParse(await readJson(req))
  if (!parsed.success) throw ApiError.validation(zodDetails(parsed.error))
  const email = parsed.data.email.toLowerCase().trim()

  const user = await db.user.findUnique({ where: { email } })
  let devToken: string | undefined
  if (user && user.status === 'ACTIVE') {
    const token = randomToken(24)
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_MINUTES * 60_000),
      },
    })
    await enqueueJob('SEND_EMAIL', {
      to: user.email,
      subject: 'FreshRelay password reset',
      body: `Use this single-use token within ${RESET_TOKEN_MINUTES} minutes to reset your password:\n\n${token}\n\nIf you did not request this, ignore this email.`,
    })
    await audit(user.id, 'PASSWORD_RESET_REQUESTED', 'User', user.id, {})
    if (process.env.NODE_ENV !== 'production') devToken = token
  }

  return NextResponse.json({
    ok: true,
    message: 'If that email exists, a reset link has been sent.',
    ...(devToken ? { devToken } : {}),
  })
})
