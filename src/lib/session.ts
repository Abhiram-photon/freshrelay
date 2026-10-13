import { NextRequest, NextResponse } from 'next/server'
import { db } from './db'
import { SESSION_DAYS } from './config'
import { randomToken, sha256 } from './tokens'
import { ApiError } from './errors'
import { Organization, User } from '@prisma/client'

export const SESSION_COOKIE = 'fr_session'
export const CSRF_COOKIE = 'fr_csrf'
export const CSRF_HEADER = 'x-csrf-token'

export type UserWithOrgs = User & { organizations: Organization[] }

/** Cookies must be Secure on https (the preview gateway) but plain http must still work locally. */
export function isSecureRequest(req: NextRequest): boolean {
  const proto = req.headers.get('x-forwarded-proto')
  if (proto) return proto.split(',')[0].trim() === 'https'
  try {
    return req.nextUrl.protocol === 'https:'
  } catch {
    return false
  }
}

function cookieOptions(req: NextRequest, maxAgeSec: number, httpOnly = true) {
  return {
    httpOnly,
    sameSite: 'lax' as const,
    secure: isSecureRequest(req),
    path: '/',
    maxAge: maxAgeSec,
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32)
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  await db.session.create({
    data: { userId, tokenHash: sha256(token), expiresAt },
  })
  return { token, expiresAt }
}

export function setSessionCookie(res: NextResponse, req: NextRequest, token: string, expiresAt: Date): void {
  const maxAge = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(req, maxAge))
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
}

export async function getSessionUser(req: NextRequest): Promise<UserWithOrgs | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { organizations: true } } },
  })
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined)
    return null
  }
  if (session.user.status !== 'ACTIVE') return null // suspended users lose access immediately
  return session.user
}

export async function destroySession(req: NextRequest): Promise<void> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return
  await db.session.deleteMany({ where: { tokenHash: sha256(token) } })
}

// ---------------------------------------------------------------------------
// CSRF (double-submit cookie + same-origin check)
// ---------------------------------------------------------------------------

export function ensureCsrfToken(req: NextRequest, res: NextResponse): string {
  const existing = req.cookies.get(CSRF_COOKIE)?.value
  if (existing && existing.length >= 16) return existing
  const token = randomToken(24)
  res.cookies.set(CSRF_COOKIE, token, cookieOptions(req, 7 * 86_400, false))
  return token
}

/** Every mutating request must present header x-csrf-token == fr_csrf cookie. */
export function assertCsrf(req: NextRequest): void {
  const origin = req.headers.get('origin')
  if (origin && origin !== 'null') {
    // Behind the preview gateway the request may traverse several proxies, so
    // x-forwarded-host can be a comma-separated chain. Accept the origin when
    // it matches ANY hop; the double-submit cookie below remains the primary
    // CSRF defense regardless.
    const candidates = new Set<string>()
    for (const key of ['x-forwarded-host', 'host']) {
      const raw = req.headers.get(key)
      if (!raw) continue
      for (const part of raw.split(',')) {
        const h = part.trim()
        if (h) {
          candidates.add(h.toLowerCase())
          // Also tolerate the default port variants (https→443, http→80).
          candidates.add(h.toLowerCase().replace(/:(443|80)$/, ''))
        }
      }
    }
    try {
      const originHost = new URL(origin).host.toLowerCase()
      const originHostBare = originHost.replace(/:(443|80)$/, '')
      if (candidates.size > 0 && !candidates.has(originHost) && !candidates.has(originHostBare)) {
        throw ApiError.csrf('Cross-origin request rejected')
      }
    } catch (err) {
      if (err instanceof ApiError) throw err
      // Unparseable Origin (never 'null' here): skip — double-submit still applies.
    }
  }
  const cookie = req.cookies.get(CSRF_COOKIE)?.value
  const header = req.headers.get(CSRF_HEADER)
  if (!cookie || !header || cookie.length < 16 || cookie !== header) {
    throw ApiError.csrf()
  }
}
