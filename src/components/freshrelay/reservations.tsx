'use client'

import { useMemo, useState } from 'react'
import { useAppStore } from '@/lib/client/store'
import { useMyReservations, useInvalidate } from './hooks'
import { api, ApiErrorClient, ReservationDTO } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { CountdownBadge, StatusBadge, StorageBadge, EmptyState, PageSkeleton, ErrorState } from './bits'
import { formatQty, fmtDateTime } from '@/lib/client/format'
import { toast } from 'sonner'
import { Copy, Ban, MapPin, Clock, ArrowLeftRight } from 'lucide-react'

export function MyReservations() {
  const { navigate } = useAppStore()
  const query = useMyReservations(true)
  const [tab, setTab] = useState('upcoming')

  const groups = useMemo(() => {
    const items = query.data?.items ?? []
    return {
      upcoming: items.filter((r) => ['HELD', 'CONFIRMED', 'LOCKED'].includes(r.status)),
      past: items.filter((r) => ['COLLECTED', 'EXPIRED'].includes(r.status)),
      cancelled: items.filter((r) => r.status === 'CANCELLED'),
    }
  }, [query.data])

  if (query.isLoading) return <PageSkeleton />
  if (query.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorState message="Could not load your reservations." onRetry={() => query.refetch()} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">My reservations</h1>
      <p className="text-sm text-muted-foreground">Show the 6-digit code at pickup — it&apos;s single-use.</p>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList className="grid w-full grid-cols-3 sm:w-auto">
          <TabsTrigger value="upcoming">
            Upcoming <Badge variant="secondary" className="ml-1.5">{groups.upcoming.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="past">
            Past <Badge variant="secondary" className="ml-1.5">{groups.past.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            Cancelled <Badge variant="secondary" className="ml-1.5">{groups.cancelled.length}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4 space-y-3" data-testid="reservations-list">
        {tab === 'upcoming' &&
          (groups.upcoming.length === 0 ? (
            <EmptyState
              emoji="🛒"
              title="Nothing reserved yet"
              body="Browse surplus food nearby and reserve what your organization needs."
              action={<Button onClick={() => navigate('browse')}>Browse surplus food</Button>}
            />
          ) : (
            groups.upcoming.map((r) => <UpcomingReservation key={r.id} r={r} />)
          ))}
        {tab === 'past' &&
          (groups.past.length === 0 ? (
            <EmptyState emoji="📜" title="No past reservations yet" body="Collected and expired pickups will show up here." />
          ) : (
            groups.past.map((r) => <PastReservation key={r.id} r={r} />)
          ))}
        {tab === 'cancelled' &&
          (groups.cancelled.length === 0 ? (
            <EmptyState emoji="🗂️" title="Nothing cancelled" body="Cancelled reservations (by you or the provider) appear here." />
          ) : (
            groups.cancelled.map((r) => <PastReservation key={r.id} r={r} />)
          ))}
      </div>
    </div>
  )
}

function UpcomingReservation({ r }: { r: ReservationDTO }) {
  const { navigate } = useAppStore()
  const invalidate = useInvalidate()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function cancel() {
    setBusy(true)
    try {
      await api(`/reservations/${r.id}`, { method: 'DELETE', body: { reason: 'No longer needed' } })
      toast.success('Reservation cancelled — thanks for telling us early')
      invalidate('my-reservations', 'listings', 'listing', 'notifications')
      setCancelOpen(false)
    } catch (err) {
      toast.error(err instanceof ApiErrorClient ? err.message : 'Cancel failed')
    } finally {
      setBusy(false)
    }
  }

  const locked = r.status === 'LOCKED'

  return (
    <Card className="py-0" data-testid="upcoming-reservation">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{r.listing.title}</h3>
            <StatusBadge status={r.status} />
          </div>
          <CountdownBadge windowEnd={r.listing.windowEnd} />
        </div>
        <p className="text-sm text-muted-foreground">
          {formatQty(r.quantity, r.listing.unit)} · {r.listing.orgName}
        </p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Clock className="size-3" aria-hidden /> {fmtDateTime(r.pickupStart)} → {fmtDateTime(r.pickupEnd)}</span>
          <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden /> {r.listing.pickupAddress}</span>
        </p>
        {r.listing.pickupInstructions && <p className="text-xs text-muted-foreground">Instructions: {r.listing.pickupInstructions}</p>}

        {locked ? (
          <Alert variant="destructive">
            <Ban className="size-4" aria-hidden />
            <AlertTitle>Verification locked</AlertTitle>
            <AlertDescription>5 wrong codes were entered. The provider can cancel it to release stock.</AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border bg-emerald-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-800">Your pickup code</p>
              <p className="font-mono text-4xl font-bold tracking-[0.25em] text-emerald-700" data-testid="pickup-code">
                {r.code ?? '——————'}
              </p>
              {r.failedAttempts > 0 && (
                <p className="mt-1 text-xs text-red-600">{r.failedAttempts}/5 failed attempts by the provider — check the code carefully.</p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => {
                if (r.code) {
                  void navigator.clipboard?.writeText(r.code)
                  toast.success('Code copied')
                }
              }}
            >
              <Copy className="size-4" aria-hidden /> Copy
            </Button>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('listing', { id: r.listing.id })}>
            <ArrowLeftRight className="size-3.5" aria-hidden /> View listing
          </Button>
          {!locked && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-red-600 hover:text-red-700" onClick={() => setCancelOpen(true)}>
              <Ban className="size-3.5" aria-hidden /> Cancel reservation
            </Button>
          )}
        </div>
      </CardContent>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this reservation?</AlertDialogTitle>
            <AlertDialogDescription>
              The {formatQty(r.quantity, r.listing.unit)} becomes available for other organizations. The provider is
              notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reservation</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={(e) => { e.preventDefault(); void cancel() }} disabled={busy}>
              {busy ? 'Cancelling…' : 'Cancel reservation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function PastReservation({ r }: { r: ReservationDTO }) {
  return (
    <Card className="py-0 opacity-90">
      <CardContent className="space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{r.listing.title}</h3>
          <StatusBadge status={r.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {formatQty(r.quantity, r.listing.unit)} · {r.listing.orgName}
          {r.status === 'COLLECTED' && r.collectedAt && ` · collected ${fmtDateTime(r.collectedAt)}`}
        </p>
        {r.cancelReason && <p className="text-xs text-red-600">Reason: {r.cancelReason}</p>}
        <StorageBadge storageType={r.listing.storageType} />
      </CardContent>
    </Card>
  )
}
