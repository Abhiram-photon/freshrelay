import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, UserWithOrgs } from './session'
import { ApiError, errorResponse } from './errors'
import { Organization } from '@prisma/client'

export type AuthContext = {
  user: UserWithOrgs
  primaryOrg: Organization | null
}

export async function getAuth(req: NextRequest): Promise<AuthContext | null> {
  const user = await getSessionUser(req)
  if (!user) return null
  return { user, primaryOrg: user.organizations[0] ?? null }
}

export async function requireAuth(req: NextRequest): Promise<AuthContext> {
  const ctx = await getAuth(req)
  if (!ctx) throw ApiError.unauthenticated()
  return ctx
}

export async function requireRole(req: NextRequest, ...roles: string[]): Promise<AuthContext> {
  const ctx = await requireAuth(req)
  if (!roles.includes(ctx.user.role)) throw ApiError.forbidden()
  return ctx
}

/** Guards endpoints that require an APPROVED organization (reserving/publishing). */
export function requireApprovedOrg(ctx: AuthContext): Organization {
  if (!ctx.primaryOrg) throw ApiError.forbidden('No organization on this account')
  if (ctx.primaryOrg.verificationStatus !== 'APPROVED') {
    throw ApiError.forbidden('Your organization is awaiting verification')
  }
  return ctx.primaryOrg
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'local'
}

/** Wraps a route handler with unified error mapping. */
export function routeHandler<C>(fn: (req: NextRequest, ctx: C) => Promise<NextResponse>) {
  return async (req: NextRequest, ctx: C): Promise<NextResponse> => {
    try {
      return await fn(req, ctx)
    } catch (err) {
      return errorResponse(err)
    }
  }
}

/** Parse JSON body with a hard size cap. */
export async function readJson(req: NextRequest, maxBytes = 100_000): Promise<unknown> {
  const text = await req.text()
  if (text.length > maxBytes) throw ApiError.badRequest('Request body too large')
  try {
    return JSON.parse(text || '{}')
  } catch {
    throw ApiError.badRequest('Invalid JSON body')
  }
}

/** Numeric query param with bounds. */
export function numParam(
  params: URLSearchParams,
  key: string,
  opts: { min?: number; max?: number; default?: number; integer?: boolean } = {}
): number | undefined {
  const raw = params.get(key)
  if (raw === null || raw === '') return opts.default
  let n = Number(raw)
  if (!Number.isFinite(n)) return opts.default
  if (opts.integer) n = Math.trunc(n)
  if (opts.min !== undefined && n < opts.min) n = opts.min
  if (opts.max !== undefined && n > opts.max) n = opts.max
  return n
}

export { zodDetails } from './errors'
