import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, readJson, clientIp } from '@/lib/api'
import { registerSchema } from '@/lib/schemas'
import { ApiError, zodDetails } from '@/lib/errors'
import { assertCsrf } from '@/lib/session'
import { hashPassword } from '@/lib/password'
import { db } from '@/lib/db'
import { enforceRateLimit } from '@/lib/rate-limit'
import { audit } from '@/lib/audit'

/**
 * POST /api/v1/auth/register
 * Creates a user + organization. Organizations start as PENDING verification:
 * pending recipients cannot reserve; pending providers cannot publish.
 */
export const POST = routeHandler(async (req: NextRequest) => {
  assertCsrf(req)
  await enforceRateLimit(`register:ip:${clientIp(req)}`, 5, 3_600_000)

  const parsed = registerSchema.safeParse(await readJson(req))
  if (!parsed.success) throw ApiError.validation(zodDetails(parsed.error))
  const input = parsed.data

  const email = input.email.toLowerCase().trim()
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) throw ApiError.conflict('EMAIL_TAKEN', 'An account with this email already exists')

  const user = await db.user.create({
    data: {
      email,
      passwordHash: hashPassword(input.password),
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      role: input.role,
      status: 'ACTIVE',
      organizations: {
        create: {
          type: input.organization.type,
          name: input.organization.name.trim(),
          address: input.organization.address.trim(),
          lat: input.organization.lat,
          lng: input.organization.lng,
          verificationStatus: 'PENDING',
        },
      },
    },
    include: { organizations: true },
  })

  await audit(user.id, 'USER_REGISTERED', 'User', user.id, { role: user.role })
  await audit(user.id, 'ORG_SUBMITTED', 'Organization', user.organizations[0]?.id ?? null, {})

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
    },
    organization: user.organizations[0]
      ? {
          id: user.organizations[0].id,
          name: user.organizations[0].name,
          type: user.organizations[0].type,
          verificationStatus: user.organizations[0].verificationStatus,
        }
      : null,
    message: 'Account created. Your organization is pending verification by an administrator.',
  })
})
