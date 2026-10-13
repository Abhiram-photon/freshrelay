import { db } from './db'
import { toKg, mealsFromKg } from './units'
import { KG_PER_MEAL } from './config'

/**
 * Impact analytics. Only COLLECTED reservations count.
 * Meals estimate: meals = kg / KG_PER_MEAL where 1 meal ≈ 0.4 kg — an
 * explicitly-labelled estimate (formula shown in the UI).
 */

export type ImpactBucket = { month: string; kg: number; pickups: number }

export type ImpactResult = {
  totalKg: number
  totalOriginal: number
  pickups: number
  mealsEstimate: number
  mealsFormula: string
  monthly: ImpactBucket[]
}

export async function computeImpact(opts: {
  direction: 'PROVIDER' | 'RECIPIENT'
  orgIds: string[]
  from?: Date
  to?: Date
  months?: number
}): Promise<ImpactResult> {
  const where: Record<string, unknown> = { status: 'COLLECTED' }
  const collectedRange: Record<string, Date> = {}
  if (opts.from) collectedRange.gte = opts.from
  if (opts.to) collectedRange.lte = opts.to
  if (Object.keys(collectedRange).length > 0) where.collectedAt = collectedRange
  if (opts.direction === 'PROVIDER') {
    where.listing = { orgId: { in: opts.orgIds } }
  } else {
    where.recipientOrgId = { in: opts.orgIds }
  }

  const rows: { quantity: number; collectedAt: Date | null; listing: { unit: string } }[] =
    await db.reservation.findMany({
      where,
      select: { quantity: true, collectedAt: true, listing: { select: { unit: true } } },
    })

  let totalKg = 0
  const monthlyMap = new Map<string, ImpactBucket>()
  const monthCount = opts.months ?? 6

  // Pre-seed the last N months so charts show zero-months too.
  const now = new Date()
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = monthKey(d)
    monthlyMap.set(key, { month: key, kg: 0, pickups: 0 })
  }

  for (const row of rows) {
    if (!row.collectedAt) continue
    const kg = toKg(row.quantity, row.listing.unit)
    totalKg += kg
    const key = monthKey(row.collectedAt)
    const bucket = monthlyMap.get(key)
    if (bucket) {
      bucket.kg += kg
      bucket.pickups += 1
    }
  }

  const roundedKg = Math.round(totalKg * 100) / 100
  return {
    totalKg: roundedKg,
    totalOriginal: Math.round(rows.reduce((s, r) => s + r.quantity, 0) * 100) / 100,
    pickups: rows.length,
    mealsEstimate: Math.round(mealsFromKg(totalKg) * 10) / 10,
    mealsFormula: `meals ≈ kg ÷ ${KG_PER_MEAL} (1 meal ≈ ${KG_PER_MEAL} kg — estimate)`,
    monthly: Array.from(monthlyMap.values()).map((b) => ({
      month: b.month,
      kg: Math.round(b.kg * 100) / 100,
      pickups: b.pickups,
    })),
  }
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Admin platform metrics
// ---------------------------------------------------------------------------

export async function platformMetrics(): Promise<{
  users: { role: string; count: number; suspended: number }[]
  organizations: { status: string; count: number }[]
  listings: { status: string; count: number }[]
  reservations: { status: string; count: number }[]
  impact: { totalKg: number; pickups: number; mealsEstimate: number }
}> {
  const [users, orgs, listings, reservations, collected] = await Promise.all([
    db.user.groupBy({ by: ['role'], _count: { role: true } }),
    db.organization.groupBy({ by: ['verificationStatus'], _count: { verificationStatus: true } }),
    db.listing.groupBy({ by: ['status'], _count: { status: true } }),
    db.reservation.groupBy({ by: ['status'], _count: { status: true } }),
    db.reservation.findMany({
      where: { status: 'COLLECTED' },
      select: { quantity: true, listing: { select: { unit: true } } },
    }),
  ])

  const totalKg = collected.reduce((sum, r) => sum + toKg(r.quantity, r.listing.unit), 0)
  return {
    users: users.map((u) => ({ role: u.role, count: u._count.role, suspended: 0 })),
    organizations: orgs.map((o) => ({ status: o.verificationStatus, count: o._count.verificationStatus })),
    listings: listings.map((l) => ({ status: l.status, count: l._count.status })),
    reservations: reservations.map((r) => ({ status: r.status, count: r._count.status })),
    impact: {
      totalKg: Math.round(totalKg * 100) / 100,
      pickups: collected.length,
      mealsEstimate: Math.round(mealsFromKg(totalKg) * 10) / 10,
    },
  }
}
