'use client'

/**
 * Typed fetch client for the FreshRelay REST API (base path /api/v1).
 * Handles CSRF double-submit tokens automatically and normalizes the
 * { error: { code, message, details? } } shape into ApiErrorClient.
 */

export class ApiErrorClient extends Error {
  status: number
  code: string
  details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

let csrfPromise: Promise<string> | null = null

export function ensureCsrf(): Promise<string> {
  if (!csrfPromise) {
    csrfPromise = fetch('/api/v1/csrf', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { token?: string }) => d.token ?? '')
      .catch(() => {
        csrfPromise = null
        return ''
      })
  }
  return csrfPromise
}

/** Forces a fresh CSRF token on the next call (after a CSRF failure). */
function refreshCsrf(): Promise<string> {
  csrfPromise = null
  return ensureCsrf()
}

export async function api<T>(
  path: string,
  opts: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {}
): Promise<T> {
  const doFetch = async (token: string): Promise<Response> => {
    const method = opts.method ?? 'GET'
    const headers: Record<string, string> = {}
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
    if (method !== 'GET') headers['x-csrf-token'] = token
    return fetch(`/api/v1${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    })
  }

  let res = await doFetch((opts.method ?? 'GET') !== 'GET' ? await ensureCsrf() : '')
  // Stale/missing CSRF cookie (e.g. after a redeploy): fetch a fresh token and retry once.
  if (res.status === 403 && (opts.method ?? 'GET') !== 'GET') {
    try {
      const retryErr = (await res.clone().json()) as { error?: { code?: string } }
      if (retryErr?.error?.code === 'CSRF_FAILED') {
        res = await doFetch(await refreshCsrf())
      }
    } catch {
      /* keep original response */
    }
  }

  let data: unknown = {}
  try {
    data = await res.json()
  } catch {
    data = {}
  }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } }).error
    throw new ApiErrorClient(
      res.status,
      err?.code ?? 'ERROR',
      err?.message ?? 'Request failed',
      err?.details
    )
  }
  return data as T
}

// ---------------------------------------------------------------------------
// Shared API response types (mirror of server DTOs)
// ---------------------------------------------------------------------------

export type Me = {
  user: {
    id: string
    email: string
    name: string
    phone: string | null
    role: 'PROVIDER' | 'RECIPIENT' | 'ADMIN'
    status: string
    notifyNearby: boolean
  }
  organization: {
    id: string
    name: string
    type: string
    address: string
    lat: number
    lng: number
    verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED'
    verificationNote: string | null
  } | null
  unreadNotifications: number
}

export type ListingDTO = {
  id: string
  title: string
  description: string
  category: string
  quantityTotal: number
  quantityRemaining: number
  unit: string
  allergens: string[]
  storageType: string
  windowStart: string
  windowEnd: string
  expiresAt: string
  status: string
  pickupAddress?: string
  pickupInstructions?: string
  photoUrl?: string
  version: number
  createdAt: string
  location: { lat: number; lng: number; approximate: boolean }
  distanceKm: number | null
  org: { id: string; name: string; type: string; verificationStatus: string }
}

export type ListingsResponse = {
  items: ListingDTO[]
  total: number
  page: number
  pages: number
  viewerLocation: { lat: number; lng: number } | null
}

export type MyListing = {
  id: string
  title: string
  description: string
  category: string
  quantityTotal: number
  quantityRemaining: number
  unit: string
  allergens: string[]
  storageType: string
  pickupAddress: string
  windowStart: string
  windowEnd: string
  expiresAt: string
  status: string
  version: number
  photoUrl?: string
  pickupInstructions?: string
  liveReservations: number
  createdAt: string
}

export type ReservationDTO = {
  id: string
  listing: {
    id: string
    title: string
    category: string
    unit: string
    storageType: string
    photoUrl?: string
    pickupAddress: string
    pickupInstructions?: string
    windowStart: string
    windowEnd: string
    status: string
    orgName: string
    orgType: string
  }
  quantity: number
  pickupStart: string
  pickupEnd: string
  status: 'HELD' | 'CONFIRMED' | 'COLLECTED' | 'CANCELLED' | 'EXPIRED' | 'LOCKED'
  failedAttempts: number
  code?: string
  cancelReason?: string
  collectedAt?: string
  createdAt: string
}

export type ProviderReservation = {
  id: string
  listing: { id: string; title: string; unit: string; windowEnd: string; status: string }
  recipientOrg: { id: string; name: string; type: string }
  quantity: number
  pickupStart: string
  pickupEnd: string
  status: ProviderReservationStatus
  failedAttempts: number
  cancelReason?: string
  collectedAt?: string
  createdAt: string
}

export type ProviderReservationStatus =
  | 'HELD'
  | 'CONFIRMED'
  | 'COLLECTED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'LOCKED'

export type NotificationItem = {
  id: string
  type: string
  payload: Record<string, unknown>
  read: boolean
  createdAt: string
}

export type ImpactResult = {
  role: string
  totalKg: number
  pickups: number
  mealsEstimate: number
  mealsFormula: string
  monthly: { month: string; kg: number; pickups: number }[]
}

export type AdminOrg = {
  id: string
  name: string
  type: string
  address: string
  lat: number
  lng: number
  verificationStatus: string
  verificationNote: string | null
  createdAt: string
  owner: { id: string; email: string; name: string; status: string }
}

export type AdminUser = {
  id: string
  email: string
  name: string
  role: string
  status: string
  createdAt: string
  organizations: { id: string; name: string; type: string; verificationStatus: string }[]
}

export type AdminListing = {
  id: string
  title: string
  category: string
  status: string
  quantityTotal: number
  quantityRemaining: number
  unit: string
  windowStart: string
  windowEnd: string
  createdAt: string
  org: { id: string; name: string; type: string; verificationStatus: string }
}

export type AdminMetrics = {
  users: { role: string; count: number }[]
  organizations: { status: string; count: number }[]
  listings: { status: string; count: number }[]
  reservations: { status: string; count: number }[]
  impact: { totalKg: number; pickups: number; mealsEstimate: number }
}
