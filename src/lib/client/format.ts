'use client'

/** Formatting helpers — all times are stored in UTC and shown in local time. */

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** "Closes in 1h 20m" / "Closes in 45m" / "Expired". */
export function countdown(iso: string, now = Date.now()): { text: string; expired: boolean; urgent: boolean } {
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return { text: 'Expired', expired: true, urgent: true }
  const totalMin = Math.floor(ms / 60_000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const mins = totalMin % 60
  let text: string
  if (days >= 1) text = `Closes in ${days}d ${hours}h`
  else if (hours >= 1) text = `Closes in ${hours}h ${mins}m`
  else text = `Closes in ${mins}m`
  return { text, expired: false, urgent: ms < 60 * 60_000 }
}

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return fmtDate(iso)
}

/** datetime-local input value (local time) from an ISO string. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** ISO string (UTC) from a datetime-local input value. */
export function fromLocalInput(value: string): string {
  return new Date(value).toISOString()
}

export function formatQty(qty: number, unit: string): string {
  const rounded = Math.round(qty * 100) / 100
  return `${rounded} ${unit}`
}

export const CATEGORY_META: Record<string, { label: string; emoji: string; gradient: string }> = {
  BAKED_GOODS: { label: 'Baked goods', emoji: '🥖', gradient: 'from-amber-200 to-orange-300' },
  PRODUCE: { label: 'Produce', emoji: '🥕', gradient: 'from-lime-200 to-emerald-300' },
  PREPARED_MEALS: { label: 'Prepared meals', emoji: '🍛', gradient: 'from-orange-200 to-rose-300' },
  DAIRY: { label: 'Dairy', emoji: '🥛', gradient: 'from-sky-100 to-cyan-200' },
  PACKAGED_GROCERY: { label: 'Packaged', emoji: '🥫', gradient: 'from-stone-200 to-amber-200' },
  BEVERAGES: { label: 'Beverages', emoji: '🧃', gradient: 'from-fuchsia-200 to-rose-200' },
  OTHER: { label: 'Other', emoji: '🍽️', gradient: 'from-slate-200 to-slate-300' },
}

export const STORAGE_META: Record<string, { label: string; emoji: string }> = {
  AMBIENT: { label: 'Ambient', emoji: '🌡️' },
  CHILLED: { label: 'Chilled', emoji: '❄️' },
  FROZEN: { label: 'Frozen', emoji: '🧊' },
  HOT: { label: 'Keep hot', emoji: '♨️' },
}

export const ORG_TYPE_LABELS: Record<string, string> = {
  BAKERY: 'Bakery',
  GROCERY: 'Grocery',
  CATERER: 'Caterer',
  RESTAURANT: 'Restaurant',
  HOUSEHOLD: 'Household',
  FOOD_BANK: 'Food bank',
  CHARITY: 'Charity',
  SHELTER: 'Shelter',
  COMMUNITY_KITCHEN: 'Community kitchen',
}

export const ALLERGEN_LABELS: Record<string, string> = {
  GLUTEN: 'Gluten',
  CRUSTACEANS: 'Crustaceans',
  EGGS: 'Eggs',
  FISH: 'Fish',
  PEANUTS: 'Peanuts',
  SOY: 'Soy',
  MILK: 'Milk',
  TREE_NUTS: 'Tree nuts',
  CELERY: 'Celery',
  MUSTARD: 'Mustard',
  SESAME: 'Sesame',
  SULPHITES: 'Sulphites',
  LUPIN: 'Lupin',
  MOLLUSCS: 'Molluscs',
}

/** Human message for a notification. */
export function notificationText(
  type: string,
  payload: Record<string, unknown>
): { title: string; body?: string; target?: { view: string; params?: Record<string, string> } } {
  const s = (k: string) => (typeof payload[k] === 'string' ? (payload[k] as string) : '')
  switch (type) {
    case 'NEW_NEARBY_LISTING':
      return {
        title: `New nearby: ${s('title')}`,
        body: `${payload.distanceKm ?? '?'} km away · ${payload.quantity ?? ''} ${payload.unit ?? ''}`.trim(),
        target: { view: 'listing', params: { id: s('listingId') } },
      }
    case 'RESERVATION_CREATED':
      return {
        title: `New reservation for "${s('listingTitle')}"`,
        body: `${s('recipientOrgName')} reserved ${payload.quantityLabel ?? ''}`,
        target: { view: 'verify', params: { reservationId: s('reservationId') } },
      }
    case 'RESERVATION_CONFIRMED':
      return {
        title: `Reservation confirmed — "${s('listingTitle')}"`,
        body: payload.code ? `Pickup code: ${payload.code}` : undefined,
        target: { view: 'reservations' },
      }
    case 'RESERVATION_CANCELLED':
      return {
        title: `Reservation cancelled — "${s('listingTitle')}"`,
        body: s('reason') ? `Reason: ${s('reason')}` : undefined,
        target: { view: 'reservations' },
      }
    case 'LISTING_EXPIRING_SOON':
      return {
        title: `"${s('title')}" closes soon`,
        body: 'Your listing is about to expire.',
        target: { view: 'listing', params: { id: s('listingId') } },
      }
    case 'PICKUP_VERIFIED':
      return {
        title: `Pickup verified — "${s('listingTitle')}"`,
        body: 'Thanks for rescuing food!',
        target: { view: 'impact' },
      }
    case 'ORG_APPROVED':
      return { title: 'Your organization was approved 🎉', body: s('organizationName') }
    case 'ORG_REJECTED':
      return { title: 'Your organization was rejected', body: s('note') || undefined }
    case 'RESERVATION_LOCKED':
      return {
        title: 'Pickup verification locked',
        body: 'Too many failed attempts on a reservation.',
        target: { view: 'verify' },
      }
    case 'ACCOUNT_STATUS':
      return { title: 'Account update', body: typeof payload.status === 'string' ? payload.status : undefined }
    default:
      return { title: type.replaceAll('_', ' ').toLowerCase() }
  }
}
