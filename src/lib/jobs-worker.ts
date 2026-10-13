import { db } from './db'
import { emailAdapter } from './email'
import { DIGEST_MIN_INTERVAL_MINUTES, EXPIRING_SOON_WINDOW_MINUTES } from './config'
import { notifyUser } from './notify'
import { releaseReservation } from './reservations'

/**
 * Background worker: started once per process from src/instrumentation.ts.
 * Every 15 s it runs periodic sweeps and drains due jobs from the Job table.
 * Email sending and digests go through the DB-backed queue; the sweeps are
 * interval-driven and also exposed as job types for manual enqueue/testing.
 */

const TICK_MS = 15_000
const MAX_JOBS_PER_TICK = 25
const MAX_JOB_ATTEMPTS = 5

export function startWorker(): void {
  const g = globalThis as { __freshrelayWorker?: boolean }
  if (g.__freshrelayWorker) return
  g.__freshrelayWorker = true
  console.log('[worker] FreshRelay job worker started (every 15s)')
  void tick()
  const timer = setInterval(() => void tick(), TICK_MS)
  if (typeof timer.unref === 'function') timer.unref()
}

async function tick(): Promise<void> {
  try {
    await sweepExpiringSoonAlerts()
    await sweepExpireListings()
    await sweepReleaseHolds()
    await sweepExpireReservations()
    await drainDueJobs()
  } catch (err) {
    console.error('[worker] tick failed:', err)
  }
}

// ---------------------------------------------------------------------------
// Periodic sweeps
// ---------------------------------------------------------------------------

/** Listings whose window/expiry has passed are never bookable — flip them. */
export async function sweepExpireListings(): Promise<number> {
  const now = new Date()
  const result = await db.listing.updateMany({
    where: {
      status: { in: ['ACTIVE', 'PAUSED', 'RESERVED_OUT'] },
      OR: [{ windowEnd: { lte: now } }, { expiresAt: { lte: now } }],
    },
    data: { status: 'EXPIRED' },
  })
  if (result.count > 0) console.log(`[worker] expired ${result.count} listing(s)`)
  return result.count
}

/** HELD reservations whose 30-minute hold timed out release their stock. */
export async function sweepReleaseHolds(): Promise<number> {
  const now = new Date()
  const holds = await db.reservation.findMany({
    where: { status: 'HELD', holdExpiresAt: { lte: now } },
    take: 50,
  })
  for (const hold of holds) {
    await releaseReservation(hold, 'EXPIRED', 'Hold timed out')
    const payload = JSON.parse((await reservationPayload(hold.listingId)) ?? '{}')
    await notifyUser(
      hold.recipientOrgId ? (await recipientOwner(hold.recipientOrgId)) ?? '' : '',
      'RESERVATION_CANCELLED',
      { reservationId: hold.id, listingTitle: payload.title, reason: 'hold_timeout' }
    )
  }
  return holds.length
}

/** Uncollected CONFIRMED reservations expire when the listing window closes. */
export async function sweepExpireReservations(): Promise<number> {
  const now = new Date()
  const stale = await db.reservation.findMany({
    where: { status: 'CONFIRMED', listing: { windowEnd: { lte: now } } },
    include: { listing: { select: { title: true } } },
    take: 50,
  })
  for (const reservation of stale) {
    await releaseReservation(reservation, 'EXPIRED', 'Collection window passed')
    const ownerId = await recipientOwner(reservation.recipientOrgId)
    if (ownerId) {
      await notifyUser(ownerId, 'RESERVATION_CANCELLED', {
        reservationId: reservation.id,
        listingTitle: reservation.listing.title,
        reason: 'collection_window_passed',
      })
    }
  }
  return stale.length
}

/** Providers get one alert when a listing enters its final hour. */
export async function sweepExpiringSoonAlerts(): Promise<number> {
  const now = new Date()
  const soon = new Date(now.getTime() + EXPIRING_SOON_WINDOW_MINUTES * 60_000)
  const listings = await db.listing.findMany({
    where: { status: 'ACTIVE', windowEnd: { gt: now, lte: soon } },
    include: { org: { select: { ownerUserId: true, name: true } } },
    take: 100,
  })
  let sent = 0
  for (const listing of listings) {
    const existing = await db.notification.findFirst({
      where: {
        userId: listing.org.ownerUserId,
        type: 'LISTING_EXPIRING_SOON',
        payloadJson: { contains: `"listingId":"${listing.id}"` },
      },
    })
    if (existing) continue
    await notifyUser(
      listing.org.ownerUserId,
      'LISTING_EXPIRING_SOON',
      { listingId: listing.id, title: listing.title, closesAt: listing.windowEnd.toISOString() },
      {
        subject: `FreshRelay: "${listing.title}" closes soon`,
        body: `Your listing "${listing.title}" closes at ${listing.windowEnd.toISOString()}. Remaining: ${listing.quantityRemaining} ${listing.unit}.`,
      }
    )
    sent++
  }
  return sent
}

// ---------------------------------------------------------------------------
// Queued jobs
// ---------------------------------------------------------------------------

async function drainDueJobs(): Promise<void> {
  const due = await db.job.findMany({
    where: { status: 'PENDING', runAt: { lte: new Date() } },
    orderBy: { runAt: 'asc' },
    take: MAX_JOBS_PER_TICK,
  })
  for (const job of due) {
    const claimed = await db.job.updateMany({
      where: { id: job.id, status: 'PENDING' },
      data: { status: 'RUNNING' },
    })
    if (claimed.count === 0) continue
    try {
      await runJob(job.type, safeParse(job.payloadJson))
      await db.job.update({ where: { id: job.id }, data: { status: 'DONE' } })
    } catch (err) {
      const attempts = job.attempts + 1
      const willRetry = attempts < MAX_JOB_ATTEMPTS
      await db.job.update({
        where: { id: job.id },
        data: {
          status: willRetry ? 'PENDING' : 'FAILED',
          attempts,
          lastError: String(err).slice(0, 500),
          ...(willRetry ? { runAt: new Date(Date.now() + attempts * 60_000) } : {}),
        },
      })
      console.error(`[worker] job ${job.type} failed (attempt ${attempts})`, err)
    }
  }
}

async function runJob(type: string, payload: Record<string, unknown>): Promise<void> {
  switch (type) {
    case 'SEND_EMAIL':
      await emailAdapter.send({
        to: String(payload.to ?? ''),
        subject: String(payload.subject ?? 'FreshRelay'),
        body: String(payload.body ?? ''),
      })
      return
    case 'DIGEST':
      await runDigest(String(payload.userId ?? ''))
      return
    default:
      return // sweep types are handled by the interval; queued instances run inline
  }
}

/** Nearby-listing digest, rate-limited to one email per user per hour. */
async function runDigest(userId: string): Promise<void> {
  if (!userId) return
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, status: true, notifyNearby: true, lastDigestAt: true },
  })
  if (!user || user.status !== 'ACTIVE' || !user.notifyNearby) return

  const since = user.lastDigestAt ?? new Date(0)
  if (Date.now() - since.getTime() < DIGEST_MIN_INTERVAL_MINUTES * 60_000) return

  const notifications = await db.notification.findMany({
    where: { userId, type: 'NEW_NEARBY_LISTING', createdAt: { gt: since } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  await db.user.update({ where: { id: userId }, data: { lastDigestAt: new Date() } })
  if (notifications.length === 0) return

  const lines = notifications
    .map((n) => {
      const p = safeParse(n.payloadJson)
      return `- ${p.title ?? 'New listing'} (${p.distanceKm ?? '?'} km away, ${p.quantity ?? ''} ${p.unit ?? ''})`
    })
    .join('\n')
  await emailAdapter.send({
    to: user.email,
    subject: `FreshRelay: ${notifications.length} new surplus food listing(s) near you`,
    body: `New surplus food near you:\n${lines}\n\nLog in to FreshRelay to reserve before it expires.`,
  })
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function recipientOwner(orgId: string): Promise<string | null> {
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { ownerUserId: true } })
  return org?.ownerUserId ?? null
}

async function reservationPayload(listingId: string): Promise<string | null> {
  const listing = await db.listing.findUnique({ where: { id: listingId }, select: { title: true } })
  return listing ? JSON.stringify({ listingId, title: listing.title }) : null
}
