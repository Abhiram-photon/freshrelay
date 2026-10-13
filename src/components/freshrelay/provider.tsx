'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/client/store'
import { useMe, useMyListings, useProviderReservations, useImpact, useInvalidate } from './hooks'
import { api, ApiErrorClient, MyListing, ProviderReservation } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CountdownBadge, StatusBadge, StorageBadge, EmptyState, StatCard, PageSkeleton, ErrorState } from './bits'
import { formatQty, fmtDateTime, ORG_TYPE_LABELS } from '@/lib/client/format'
import { toast } from 'sonner'
import { Plus, Pencil, Pause, Play, Ban, CheckCircle2, ShieldCheck, HandHeart, Package, Users } from 'lucide-react'

export function ProviderDashboard() {
  const { navigate } = useAppStore()
  const { data: me } = useMe()
  const listings = useMyListings(true)
  const reservations = useProviderReservations(true)
  const impact = useImpact(true)
  const invalidate = useInvalidate()
  const [cancelTarget, setCancelTarget] = useState<MyListing | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const orgName = me?.organization?.name ?? 'Your organization'
  const orgApproved = me?.organization?.verificationStatus === 'APPROVED'
  const liveReservations = (reservations.data?.items ?? []).filter((r) => r.status === 'CONFIRMED')

  async function action(listing: MyListing, verb: 'pause' | 'resume' | 'cancel') {
    setBusyId(listing.id)
    try {
      await api(`/listings/${listing.id}/${verb}`, { method: 'POST', body: {} })
      toast.success(
        verb === 'pause' ? 'Listing paused' : verb === 'resume' ? 'Listing active again' : 'Listing cancelled — stock released'
      )
      invalidate('my-listings', 'provider-reservations', 'listings', 'listing')
    } catch (err) {
      toast.error(err instanceof ApiErrorClient ? err.message : 'Action failed')
    } finally {
      setBusyId(null)
      setCancelTarget(null)
    }
  }

  async function publish(listing: MyListing) {
    setBusyId(listing.id)
    try {
      await api(`/listings/${listing.id}`, {
        method: 'PATCH',
        body: { publish: true, version: listing.version },
      })
      toast.success('Listing published — nearby recipients notified')
      invalidate('my-listings', 'listings', 'notifications')
    } catch (err) {
      toast.error(err instanceof ApiErrorClient ? err.message : 'Publish failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Provider dashboard</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            {orgName} · {me?.organization ? ORG_TYPE_LABELS[me.organization.type] : ''}
            {orgApproved && <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-800"><ShieldCheck className="size-3" aria-hidden /> Verified</Badge>}
          </p>
        </div>
        <Button onClick={() => navigate('listing-form')} className="gap-2">
          <Plus className="size-4" aria-hidden /> New listing
        </Button>
      </div>

      <Tabs defaultValue="listings" className="mt-6">
        <TabsList>
          <TabsTrigger value="listings">My listings</TabsTrigger>
          <TabsTrigger value="reservations">
            Reservations
            {liveReservations.length > 0 && (
              <Badge className="ml-1.5 h-4 min-w-4 px-1 text-[10px] leading-4">{liveReservations.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="overview">Impact</TabsTrigger>
        </TabsList>

        <TabsContent value="listings" className="mt-4">
          {listings.isLoading ? (
            <PageSkeleton />
          ) : listings.isError ? (
            <ErrorState message="Could not load your listings." onRetry={() => listings.refetch()} />
          ) : (listings.data?.items.length ?? 0) === 0 ? (
            <EmptyState
              emoji="🥬"
              title="No listings yet"
              body="Publish your first surplus batch — recipients nearby will be notified instantly."
              action={
                <Button onClick={() => navigate('listing-form')} className="gap-2">
                  <Plus className="size-4" aria-hidden /> Create listing
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {listings.data!.items.map((l) => (
                <Card key={l.id} className="py-0">
                  <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{l.title}</h3>
                        <StatusBadge status={l.status} />
                        {['ACTIVE', 'PAUSED', 'RESERVED_OUT'].includes(l.status) && <CountdownBadge windowEnd={l.windowEnd} />}
                        {l.liveReservations > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            <Users className="size-3" aria-hidden /> {l.liveReservations} live reservation{l.liveReservations > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span><Package className="inline size-3" aria-hidden /> {formatQty(l.quantityRemaining, l.unit)} of {formatQty(l.quantityTotal, l.unit)} left</span>
                        <span>{fmtDateTime(l.windowStart)} → {fmtDateTime(l.windowEnd)}</span>
                        <StorageBadge storageType={l.storageType} />
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('listing-form', { id: l.id })}>
                        <Pencil className="size-3.5" aria-hidden /> Edit
                      </Button>
                      {l.status === 'DRAFT' && (
                        <Button size="sm" className="gap-1.5" disabled={!orgApproved || busyId === l.id} onClick={() => publish(l)} title={!orgApproved ? 'Your organization must be approved to publish' : undefined}>
                          <CheckCircle2 className="size-3.5" aria-hidden /> Publish
                        </Button>
                      )}
                      {l.status === 'ACTIVE' || l.status === 'RESERVED_OUT' ? (
                        <Button variant="outline" size="sm" className="gap-1.5" disabled={busyId === l.id} onClick={() => action(l, 'pause')}>
                          <Pause className="size-3.5" aria-hidden /> Pause
                        </Button>
                      ) : null}
                      {l.status === 'PAUSED' && (
                        <Button variant="outline" size="sm" className="gap-1.5" disabled={busyId === l.id} onClick={() => action(l, 'resume')}>
                          <Play className="size-3.5" aria-hidden /> Resume
                        </Button>
                      )}
                      {['DRAFT', 'ACTIVE', 'PAUSED', 'RESERVED_OUT'].includes(l.status) && (
                        <Button variant="ghost" size="sm" className="gap-1.5 text-red-600 hover:text-red-700" onClick={() => setCancelTarget(l)}>
                          <Ban className="size-3.5" aria-hidden /> Cancel
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="reservations" className="mt-4">
          {reservations.isLoading ? (
            <PageSkeleton />
          ) : reservations.isError ? (
            <ErrorState message="Could not load reservations." onRetry={() => reservations.refetch()} />
          ) : (reservations.data?.items.length ?? 0) === 0 ? (
            <EmptyState emoji="📦" title="No reservations yet" body="When recipients reserve your listings, they appear here with verify buttons." />
          ) : (
            <div className="space-y-3">
              {reservations.data!.items.map((r) => (
                <ProviderReservationRow key={r.id} r={r} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="overview" className="mt-4">
          {impact.data ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Food rescued" value={`${impact.data.totalKg} kg`} icon={<HandHeart className="size-5" />} />
                <StatCard label="Verified pickups" value={String(impact.data.pickups)} icon={<CheckCircle2 className="size-5" />} />
                <StatCard label="Meals (est.)" value={String(impact.data.mealsEstimate)} sub={impact.data.mealsFormula} icon={<Users className="size-5" />} />
              </div>
              <p className="text-xs text-muted-foreground">Only verified (COLLECTED) reservations count toward impact.</p>
            </div>
          ) : (
            <PageSkeleton />
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel &ldquo;{cancelTarget?.title}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The listing is withdrawn and every live reservation is cancelled with stock restored. Recipients are
              notified. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep listing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault()
                if (cancelTarget) void action(cancelTarget, 'cancel')
              }}
            >
              Cancel listing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ProviderReservationRow({ r }: { r: ProviderReservation }) {
  const { navigate } = useAppStore()
  const invalidate = useInvalidate()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const verifiable = r.status === 'CONFIRMED'

  async function cancel() {
    setBusy(true)
    try {
      await api(`/reservations/${r.id}`, { method: 'DELETE', body: { reason: reason || undefined } })
      toast.success('Reservation cancelled — stock restored')
      invalidate('provider-reservations', 'my-listings', 'listings')
      setCancelOpen(false)
      setReason('')
    } catch (err) {
      toast.error(err instanceof ApiErrorClient ? err.message : 'Cancel failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{r.listing.title}</h3>
            <StatusBadge status={r.status} />
            {r.failedAttempts > 0 && r.status !== 'COLLECTED' && (
              <Badge variant="outline" className="border-red-300 text-red-700">
                {r.failedAttempts}/5 failed attempts
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {r.recipientOrg.name} ({ORG_TYPE_LABELS[r.recipientOrg.type]}) · {formatQty(r.quantity, r.listing.unit)} ·
            slot {fmtDateTime(r.pickupStart)} → {fmtDateTime(r.pickupEnd)}
          </p>
          {r.cancelReason && <p className="mt-1 text-xs text-red-600">Cancelled: {r.cancelReason}</p>}
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {verifiable && (
            <Button size="sm" className="gap-1.5" onClick={() => navigate('verify', { reservationId: r.id })}>
              <ShieldCheck className="size-3.5" aria-hidden /> Verify pickup
            </Button>
          )}
          {['CONFIRMED', 'HELD'].includes(r.status) && (
            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setCancelOpen(true)}>
              <Ban className="size-3.5" aria-hidden /> Cancel
            </Button>
          )}
        </div>
      </CardContent>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this reservation?</AlertDialogTitle>
            <AlertDialogDescription>
              Stock returns to the listing and the recipient is notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Reason (shared with the recipient)</Label>
            <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. event cancelled" maxLength={200} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={(e) => { e.preventDefault(); void cancel() }} disabled={busy}>
              {busy ? 'Cancelling…' : 'Cancel reservation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
