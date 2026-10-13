import { NextRequest, NextResponse } from 'next/server'
import { routeHandler, requireRole, numParam } from '@/lib/api'
import { db } from '@/lib/db'
import { platformMetrics } from '@/lib/impact'

/** GET /api/v1/admin/metrics — platform-wide totals (ADMIN only). */
export const GET = routeHandler(async (req: NextRequest) => {
  await requireRole(req, 'ADMIN')
  const metrics = await platformMetrics()
  return NextResponse.json(metrics)
})
