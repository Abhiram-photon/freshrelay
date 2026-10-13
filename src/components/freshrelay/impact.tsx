'use client'

import { useMe, useImpact } from './hooks'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCard, PageSkeleton } from './bits'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { HandHeart, ShoppingBasket, UtensilsCrossed, Info } from 'lucide-react'

export function ImpactView() {
  const { data: me, isLoading: meLoading } = useMe()
  const { data: impact, isLoading } = useImpact(!!me)

  if (meLoading || (me && isLoading)) return <PageSkeleton />
  if (!me) return <PageSkeleton />

  const isProvider = me.user.role === 'PROVIDER'
  const isAdmin = me.user.role === 'ADMIN'

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Impact dashboard</h1>
      <p className="text-sm text-muted-foreground">
        {isAdmin
          ? 'Platform-wide rescue totals (admin view).'
          : isProvider
            ? `Food rescued through ${me.organization?.name ?? 'your listings'} — only verified pickups count.`
            : `Food collected by ${me.organization?.name ?? 'your organization'} — only verified pickups count.`}
      </p>

      {impact ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3" data-testid="impact-cards">
            <StatCard
              label="Food rescued"
              value={`${impact.totalKg} kg`}
              icon={isProvider ? <HandHeart className="size-5" /> : <ShoppingBasket className="size-5" />}
              sub="All quantities normalized to kilograms"
            />
            <StatCard
              label="Verified pickups"
              value={String(impact.pickups)}
              icon={<HandHeart className="size-5" />}
              sub="Single-use codes verified at handover"
            />
            <StatCard
              label="Meals (estimate)"
              value={String(impact.mealsEstimate)}
              icon={<UtensilsCrossed className="size-5" />}
              sub={impact.mealsFormula}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly rescued (kg)</CardTitle>
              <CardDescription>Last 6 months — COLLECTED reservations only.</CardDescription>
            </CardHeader>
            <CardContent>
              {impact.monthly.length > 0 ? (
                <div className="h-64" data-testid="impact-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={impact.monthly} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(value: number, name: string) =>
                          name === 'kg' ? [`${value} kg`, 'Rescued'] : [value, 'Pickups']
                        }
                      />
                      <Bar dataKey="kg" fill="#059669" radius={[6, 6, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">No verified pickups yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardContent className="flex items-start gap-2 p-4 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                <strong className="text-foreground">Meals estimate formula:</strong> meals ≈ kilograms ÷ 0.4 — we assume
                1 meal ≈ 0.4 kg of food (a common food-bank planning assumption, configurable per deployment). This is
                an <strong>estimate, not a measurement</strong>: non-kg units are converted with documented per-unit
                weight equivalents (e.g. 1 loaf ≈ 0.4 kg, 1 tray ≈ 1.2 kg, 1 litre ≈ 0.95 kg).
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <PageSkeleton />
      )}
    </div>
  )
}
