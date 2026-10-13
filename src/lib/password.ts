import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

/**
 * Password hashing with Node's built-in scrypt (memory-hard KDF, zero native
 * dependencies — argon2id would require node-gyp; see docs/DECISIONS.md D3).
 * Format: scrypt$N$r$p$saltHex$hashHex
 */
const N = 16384
const R = 8
const P = 1
const KEYLEN = 64

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, KEYLEN, { N, r: R, p: P })
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split('$')
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false
    const n = parseInt(parts[1], 10)
    const r = parseInt(parts[2], 10)
    const p = parseInt(parts[3], 10)
    const salt = Buffer.from(parts[4], 'hex')
    const expected = Buffer.from(parts[5], 'hex')
    const actual = scryptSync(password, salt, expected.length, { N: n, r, p })
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
