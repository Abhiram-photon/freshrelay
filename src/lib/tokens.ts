import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import { APP_SECRET } from './config'

/** URL-safe random token (session tokens, reset tokens, CSRF tokens). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** Tokens are stored hashed; the raw value only ever lives in the cookie/email. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function hmacHex(value: string): string {
  return createHmac('sha256', APP_SECRET).update(value).digest('hex')
}

/** Cryptographically random 6-digit pickup code. */
export function generatePickupCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export function pickupCodeHash(code: string): string {
  return hmacHex(`pickup:${code}`)
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex')
    const bufB = Buffer.from(b, 'hex')
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}
