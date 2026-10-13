/**
 * Central configuration. Values are overridable via environment variables
 * (see .env.example). Dev fallbacks exist so the app boots with zero config.
 */

function num(v: string | undefined, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** HMAC secret for pickup codes. Never log it. */
export const APP_SECRET = process.env.APP_SECRET ?? 'freshrelay-dev-only-secret-change-me'

/** Meals-equivalent estimate: 1 meal ≈ 0.4 kg food  →  meals = kg × 2.5.
 *  Documented assumption (see docs/DECISIONS.md); surfaced in the impact UI. */
export const KG_PER_MEAL = num(process.env.KG_PER_MEAL, 0.4)

/** Unconfirmed reservation holds release stock after this many minutes. */
export const HOLD_TIMEOUT_MINUTES = num(process.env.HOLD_TIMEOUT_MINUTES, 30)

/** Nearby-listing email digests are rate-limited to one per user per hour. */
export const DIGEST_MIN_INTERVAL_MINUTES = num(process.env.DIGEST_MIN_INTERVAL_MINUTES, 60)

/** Listings expiring within this window trigger a provider alert (once). */
export const EXPIRING_SOON_WINDOW_MINUTES = num(process.env.EXPIRING_SOON_WINDOW_MINUTES, 60)

export const DEFAULT_RADIUS_KM = 5
export const MAX_RADIUS_KM = 50

/** Pickup codes lock after this many failed verification attempts. */
export const MAX_VERIFY_ATTEMPTS = 5

/** Password reset tokens expire after 30 minutes. */
export const RESET_TOKEN_MINUTES = 30

/** Sessions last 7 days. */
export const SESSION_DAYS = 7

/** Approximate-location rounding granularity (~0.005° ≈ 500 m). */
export const APPROX_COORD_STEP = 0.005
