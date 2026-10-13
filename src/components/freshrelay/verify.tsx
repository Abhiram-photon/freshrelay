'use client'

import { useMemo, useState } from 'react'
import { useAppStore } from '@/lib/client/store'
import { useProviderReservations, useInvalidate } from './hooks'
import { api, ApiErrorClient } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { EmptyState, PageSkeleton, StatusBadge } from './bits'
import { formatQty, fmtDateTime } from '@/lib/client/format'
import { toast } from 'sonner'
import { ShieldCheck, Lock, CheckCircle2, ArrowLeft, PartyPopper } from 'lucide-react'

export function VerifyPickup({ initialReservationId }: { initialReservationId?: string }) {
  const { navigate } = useAppStore()
  const query = useProviderReservations(true)
  const invalidate = useInvalidate()
  const [selected, setSelected] = useState(initialReservationId ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<'success' | null>(null)
  const [error, setError] = useState('')

  const candidates = useMemo(
    () => (query.data?.items ?? []).filter((r) => ['CONFIRMED', 'HELD', 'LOCKED'].includes(r.status)),
    [query.data]
  )
  const current = candidates.find((r) => r.id === selected)

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    if (!current) return
    setError('')
    setBusy(true)
    try {
      await api(`/reservations/${current.id}/verify`, { method: 'POST', body: { code } })
      setResult('success')
      invalidate('provider-reservations', 'impact', 'notifications', 'my-listings')
      toast.success('Pickup verified — impact updated!')
      setCode('')
    } catch (err) {
      if (err instanceof ApiErrorClient) {
        setError(err.message)
        if (err.code === 'CODE_LOCKED') {
          invalidate('provider-reservations')
        }
      } else {
        setError('Verification failed — try again')
      }
      invalidate('provider-reservations')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <Button variant="ghost" size="sm" className="mb-4 gap-2" onClick={() => navigate('provider')}>
        <ArrowLeft className="size-4" aria-hidden /> Back to dashboard
      </Button>

      {result === 'success' ? (
        <Card data-testid="verify-success" className="border-emerald-300 bg-emerald-50">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <PartyPopper className="size-12 text-emerald-600" aria-hidden />
            <div>
              <p className="text-xl font-bold text-emerald-900">Food collected!</p>
              <p className="mt-1 text-sm text-emerald-800">
                The reservation is marked COLLECTED and counts toward your impact dashboard.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setResult(null); setSelected('') }}>
                Verify another
              </Button>
              <Button onClick={() => navigate('provider')}>Dashboard</Button>
            </div>
          </CardContent>
        </Card>
      ) : query.isLoading ? (
        <PageSkeleton />
      ) : candidates.length === 0 ? (
        <EmptyState
          emoji="🎫"
          title="No pickups to verify"
          body="When a recipient reserves your food, their reservation appears here with its own code box."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ShieldCheck className="size-5 text-emerald-600" aria-hidden /> Verify pickup
            </CardTitle>
            <CardDescription>Ask the collector for their 6-digit code and enter it below.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={verify} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="v-res" className="text-sm font-medium">Reservation</label>
                <Select value={selected} onValueChange={setSelected}>
                  <SelectTrigger id="v-res" aria-label="Reservation to verify">
                    <SelectValue placeholder="Choose a reservation…" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.listing.title} — {r.recipientOrg.name} ({formatQty(r.quantity, r.listing.unit)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {current && (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{current.listing.title}</span>
                    <StatusBadge status={current.status} />
                  </div>
                  <p className="text-muted-foreground">
                    {current.recipientOrg.name} · {formatQty(current.quantity, current.listing.unit)}
                  </p>
                  <p className="text-muted-foreground">
                    Slot: {fmtDateTime(current.pickupStart)} → {fmtDateTime(current.pickupEnd)}
                  </p>
                  {current.failedAttempts > 0 && (
                    <p className="text-xs text-red-600">{current.failedAttempts}/5 failed attempts used</p>
                  )}
                  {current.status === 'LOCKED' && (
                    <Alert variant="destructive" className="mt-2">
                      <Lock className="size-4" aria-hidden />
                      <AlertTitle>Locked</AlertTitle>
                      <AlertDescription>
                        5 wrong codes were entered. Cancel the reservation from the dashboard to release stock.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="v-code" className="text-sm font-medium">6-digit pickup code</label>
                <input
                  id="v-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full rounded-md border border-input bg-transparent py-3 text-center font-mono text-3xl tracking-[0.5em] shadow-sm focus-visible:outline-2 focus-visible:outline-ring"
                  placeholder="······"
                  aria-describedby="v-code-help"
                  data-testid="verify-code-input"
                />
                <p id="v-code-help" className="text-xs text-muted-foreground">
                  Codes are valid from the pickup slot start until the listing window closes. 5 wrong attempts lock the
                  reservation.
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription data-testid="verify-error">{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full gap-2" size="lg" disabled={busy || !current || code.length !== 6 || current.status === 'LOCKED'}>
                <CheckCircle2 className="size-4" aria-hidden /> {busy ? 'Verifying…' : 'Verify & mark collected'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
