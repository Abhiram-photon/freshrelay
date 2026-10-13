import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, readJson, clientIp } from '@/lib/api'
import { loginSchema } from '@/lib/schemas'
import { ApiError, zodDetails } from '@/lib/errors'
import { assertCsrf, createSession, ensureCsrfToken, setSessionCookie } from '@/lib/session'
import { verifyPassword } from '@/lib/password'
import { db } from '@/lib/db'
import { enforceRateLimit } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'

/** POST /api/v1/auth/login — email + password, session cookie on success. */
export const POST = routeHandler(async (req: NextRequest) => {
  assertCsrf(req)
  const ip = clientIp(req)
  await enforceRateLimit(`login:ip:${ip}`, 20, 15 * 60_000)

  const parsed = loginSchema.safeParse(await readJson(req))
  if (!parsed.success) throw ApiError.validation(zodDetails(parsed.error))
  const email = parsed.data.email.toLowerCase().trim()

  await enforceRateLimit(`login:ip:email:${ip}:${email}`, 10, 15 * 60_000)

  const user = await db.user.findUnique({ where: { email }, include: { organizations: true } })
  const valid = user ? verifyPassword(parsed.data.password, user.passwordHash) : false
  if (!user || !valid) {
    throw ApiError.unauthenticated('Invalid email or password')
  }
  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden('This account is suspended. Contact an administrator.')
  }

  const { token, expiresAt } = await createSession(user.id)
  await audit(user.id, 'USER_LOGIN', 'User', user.id, {})

  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status },
    organization: user.organizations[0]
      ? {
          id: user.organizations[0].id,
          name: user.organizations[0].name,
          type: user.organizations[0].type,
          verificationStatus: user.organizations[0].verificationStatus,
        }
      : null,
  })
  setSessionCookie(res, req, token, expiresAt)
  ensureCsrfToken(req, res)
  return res
})
