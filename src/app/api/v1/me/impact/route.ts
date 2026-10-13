import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireAuth } from '@/lib/api'
import { computeImpact, platformMetrics } from '@/lib/impact'

/**
 * GET /api/v1/me/impact?from&to — role-specific impact.
 * Providers: food collected from their listings. Recipients: food they collected.
 * Admins: platform-wide totals. Only COLLECTED reservations count.
 */
export const GET = routeHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req)
  const params = req.nextUrl.searchParams
  const from = params.get('from') ? new Date(params.get('from') as string) : undefined
  const to = params.get('to') ? new Date(params.get('to') as string) : undefined

  if (auth.user.role === 'ADMIN') {
    const metrics = await platformMetrics()
    return NextResponse.json({ role: 'ADMIN', ...metrics.impact, mealsFormula: `meals ≈ kg ÷ 0.4 (1 meal ≈ 0.4 kg — estimate)`, monthly: [] })
  }

  const orgIds = auth.user.organizations.map((o) => o.id)
  const impact = await computeImpact({
    direction: auth.user.role === 'PROVIDER' ? 'PROVIDER' : 'RECIPIENT',
    orgIds,
    from: from && !isNaN(from.getTime()) ? from : undefined,
    to: to && !isNaN(to.getTime()) ? to : undefined,
  })
  return NextResponse.json({ role: auth.user.role, ...impact })
})
