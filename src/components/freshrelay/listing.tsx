'use client'

import { useMemo, useState } from 'react'
import { useAppStore } from '@/lib/client/store'
import { useMe, useListing, useInvalidate } from './hooks'
import { api, ApiErrorClient, ListingDTO } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CountdownBadge, CategoryArt, StorageBadge, StatusBadge, AllergenChips, PageSkeleton, ErrorState } from './bits'
import { FreshMap } from './map'
import { formatQty, fmtDateTime, toLocalInput, fromLocalInput, ORG_TYPE_LABELS, CATEGORY_META } from '@/lib/client/format'
import { toast } from 'sonner'
import {
  ArrowLeft,
  MapPin,
  Clock,
  ShieldAlert,
  Package,
  StickyNote,
  Info,
  Lock,
  Ban,
  Hourglass,
} from 'lucide-react'

export function ListingDetail({ id }: { id?: string }) {
  const { navigate } = useAppStore()
  const query = useListing(id ?? null)
  const { data: me } = useMe()

  if (!id || query.isLoading) return <PageSkeleton />
  if (query.isError || !query.data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <ErrorState message="This listing does not exist or is no longer available." onRetry={() => navigate('browse')} />
      </div>
    )
  }

  const { listing, exact, isOwner } = query.data
  const meta = CATEGORY_META[listing.category] ?? CATEGORY_META.OTHER
  const now = Date.now()
  const windowStarted = new Date(listing.windowStart).getTime() <= now
  const windowEnded = new Date(listing.windowEnd).getTime() <= now
  const expired = listing.status === 'EXPIRED' || windowEnded || new Date(listing.expiresAt).getTime() <= now
  const soldOut = listing.quantityRemaining <= 0
  const role = me?.user.role
  const orgApproved = me?.organization?.verificationStatus === 'APPROVED'

  const reserveBlockers: { title: string; body: string; icon: React.ReactNode }[] = []
  if (!me) {
    reserveBlockers.push({ title: 'Log in to reserve', body: 'Recipient organizations with verified accounts can reserve pickups.', icon: <Lock className="size-4" /> })
  } else if (role === 'RECIPIENT' && !orgApproved) {
    reserveBlockers.push({ title: 'Organization pending verification', body: 'An admin must approve your organization before you can reserve.', icon: <Hourglass className="size-4" /> })
  } else if (role === 'PROVIDER') {
    reserveBlockers.push({ title: 'Providers cannot reserve', body: 'Switch to a recipient account to reserve surplus food.', icon: <Ban className="size-4" /> })
  } else if (role === 'ADMIN') {
    reserveBlockers.push({ title: 'Admin account', body: 'Administrators coordinate the platform; use a recipient account to reserve.', icon: <Info className="size-4" /> })
  }
  if (expired) {
    reserveBlockers.push({ title: 'Collection window closed', body: 'This listing expired and stock is no longer reservable.', icon: <Clock className="size-4" /> })
  } else if (listing.status !== 'ACTIVE') {
    reserveBlockers.push({ title: `Listing is ${listing.status.toLowerCase()}`, body: listing.status === 'RESERVED_OUT' ? 'Everything is reserved. A cancellation would reopen stock.' : 'Only active listings accept reservations.', icon: <Ban className="size-4" /> })
  } else if (soldOut) {
    reserveBlockers.push({ title: 'Fully reserved', body: 'No stock left. Cancels elsewhere may reopen it.', icon: <Package className="size-4" /> })
  } else if (!windowStarted) {
    reserveBlockers.push({ title: 'Window opens soon', body: `You can reserve now — the pickup window opens ${fmtDateTime(listing.windowStart)}.`, icon: <Clock className="size-4" /> })
  }

  const canReserve = role === 'RECIPIENT' && orgApproved && listing.status === 'ACTIVE' && !soldOut && !expired

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Button variant="ghost" size="sm" className="mb-4 gap-2" onClick={() => navigate('browse')}>
        <ArrowLeft className="size-4" aria-hidden /> Back to browse
      </Button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left: info */}
        <div className="space-y-5 min-w-0">
          <div className="flex gap-4">
            <CategoryArt category={listing.category} photoUrl={listing.photoUrl} className="hidden size-28 shrink-0 rounded-xl sm:flex" emojiClassName="text-6xl" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{listing.title}</h1>
                <CountdownBadge windowEnd={listing.windowEnd} />
                {listing.status !== 'ACTIVE' && <StatusBadge status={listing.status} />}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {listing.org.name} · {ORG_TYPE_LABELS[listing.org.type] ?? listing.org.type}
                {listing.distanceKm != null && <> · {listing.distanceKm} km away</>}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary" className="gap-1"><span aria-hidden>{meta.emoji}</span> {meta.label}</Badge>
                <StorageBadge storageType={listing.storageType} />
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="p-4">
              <p className="whitespace-pre-line text-sm">{listing.description}</p>
            </CardContent>
          </Card>

          <Alert className="border-orange-200 bg-orange-50 text-orange-900 [&>svg]:text-orange-600">
            <ShieldAlert className="size-4" aria-hidden />
            <AlertTitle>Allergens &amp; storage</AlertTitle>
            <AlertDescription>
              {listing.allergens.length > 0 ? (
                <div className="mt-1 space-y-1.5">
                  <p className="font-medium">Contains: {listing.allergens.map((a) => a.charAt(0) + a.slice(1).toLowerCase().replace('_', ' ')).join(', ')}</p>
                  <p className="text-xs">Providers are responsible for allergen accuracy. Always inspect food at pickup.</p>
                </div>
              ) : (
                <p>No allergens declared by the provider — still inspect at pickup.</p>
              )}
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4" aria-hidden /> Collection window
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Opens:</span> {fmtDateTime(listing.windowStart)}
              </p>
              <p>
                <span className="text-muted-foreground">Closes:</span> {fmtDateTime(listing.windowEnd)}
              </p>
              <p>
                <span className="text-muted-foreground">Best before / expires:</span> {fmtDateTime(listing.expiresAt)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="size-4" aria-hidden /> Pickup location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {exact && listing.pickupAddress ? (
                <>
                  <p className="font-medium">{listing.pickupAddress}</p>
                  {listing.pickupInstructions && (
                    <p className="flex items-start gap-1.5 text-muted-foreground">
                      <StickyNote className="mt-0.5 size-4 shrink-0" aria-hidden /> {listing.pickupInstructions}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  Exact address is shared after your reservation is confirmed. Shown here: approximate area (~500 m).
                </p>
              )}
              <div className="h-56 overflow-hidden rounded-lg border">
                <FreshMap
                  listings={[{ id: listing.id, title: listing.title, lat: listing.location.lat, lng: listing.location.lng, category: listing.category }]}
                  center={{ lat: listing.location.lat, lng: listing.location.lng }}
                  radiusKm={1}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: reserve panel */}
        <div className="space-y-4">
          <ReservePanel listing={listing} canReserve={canReserve} blockers={reserveBlockers} isOwner={isOwner} />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Remaining</span>
                <span className="font-semibold">{formatQty(listing.quantityRemaining, listing.unit)}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${listing.quantityRemaining} of ${listing.quantityTotal} ${listing.unit} remaining`}>
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${Math.max(4, (listing.quantityRemaining / Math.max(1, listing.quantityTotal)) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">of {formatQty(listing.quantityTotal, listing.unit)} listed</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ReservePanel({
  listing,
  canReserve,
  blockers,
  isOwner,
}: {
  listing: ListingDTO
  canReserve: boolean
  blockers: { title: string; body: string; icon: React.ReactNode }[]
  isOwner: boolean
}) {
  const { navigate } = useAppStore()
  const invalidate = useInvalidate()
  const [qty, setQty] = useState(() => Math.max(1, Math.min(5, Math.floor(listing.quantityRemaining))))
  const [slotStart, setSlotStart] = useState(() => {
    const start = Math.max(Date.now() + 30 * 60_000, new Date(listing.windowStart).getTime())
    return toLocalInput(new Date(start).toISOString())
  })
  const [slotEnd, setSlotEnd] = useState(() => {
    const end = Math.min(Date.now() + 2 * 3_600_000, new Date(listing.windowEnd).getTime() - 60_000)
    return toLocalInput(new Date(Math.max(end, Date.now() + 60 * 60_000)).toISOString())
  })
  const [busy, setBusy] = useState(false)
  const [successCode, setSuccessCode] = useState<string | null>(null)

  const maxQty = Math.floor(listing.quantityRemaining)

  async function reserve() {
    setBusy(true)
    try {
      const res = await api<{ reservation: { id: string; code: string } }>(`/listings/${listing.id}/reservations`, {
        method: 'POST',
        body: {
          quantity: qty,
          pickupStart: fromLocalInput(slotStart),
          pickupEnd: fromLocalInput(slotEnd),
        },
      })
      invalidate('me-reservations', 'notifications', 'listings', 'listing')
      setSuccessCode(res.reservation.code)
    } catch (err) {
      if (err instanceof ApiErrorClient) {
        toast.error(err.message)
      } else {
        toast.error('Could not reserve — try again')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card data-testid="reserve-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Reserve a pickup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canReserve ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="qty" className="flex justify-between">
                <span>Quantity</span>
                <span className="font-semibold text-foreground">
                  {qty} {listing.unit}
                </span>
              </Label>
              <Slider
                id="qty"
                min={1}
                max={maxQty}
                step={1}
                value={[qty]}
                onValueChange={([v]) => setQty(v)}
                aria-label={`Quantity between 1 and ${maxQty} ${listing.unit}`}
              />
              <p className="text-xs text-muted-foreground">1–{maxQty} {listing.unit} available</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="slot-start">Pickup from</Label>
                <Input
                  id="slot-start"
                  type="datetime-local"
                  value={slotStart}
                  onChange={(e) => setSlotStart(e.target.value)}
                  min={toLocalInput(listing.windowStart)}
                  max={toLocalInput(listing.windowEnd)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="slot-end">Pickup until</Label>
                <Input
                  id="slot-end"
                  type="datetime-local"
                  value={slotEnd}
                  onChange={(e) => setSlotEnd(e.target.value)}
                  min={slotStart}
                  max={toLocalInput(listing.windowEnd)}
                />
              </div>
            </div>
            <Button className="w-full" size="lg" onClick={reserve} disabled={busy}>
              {busy ? 'Reserving…' : `Reserve ${qty} ${listing.unit}`}
            </Button>
            <p className="text-xs text-muted-foreground">
              Stock is held for you until collected or cancelled. You&apos;ll get a 6-digit pickup code.
            </p>
          </>
        ) : isOwner ? (
          <>
            <Alert>
              <Info className="size-4" aria-hidden />
              <AlertTitle>This is your listing</AlertTitle>
              <AlertDescription>Manage its status, reservations and verifications from your dashboard.</AlertDescription>
            </Alert>
            <Button className="w-full" onClick={() => navigate('provider')}>
              Open provider dashboard
            </Button>
          </>
        ) : (
          <div className="space-y-3">
            {blockers.map((b) => (
              <div key={b.title} className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3">
                <span className="mt-0.5 text-muted-foreground">{b.icon}</span>
                <div>
                  <p className="text-sm font-semibold">{b.title}</p>
                  <p className="text-xs text-muted-foreground">{b.body}</p>
                </div>
              </div>
            ))}
            {!canReserve && blockers.some((b) => b.title === 'Log in to reserve') && (
              <Button className="w-full" onClick={() => navigate('login')}>
                Log in
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={successCode !== null} onOpenChange={(open) => !open && setSuccessCode(null)}>
        <DialogContent className="text-center">
          <DialogHeader>
            <DialogTitle className="text-xl">Reservation confirmed 🎉</DialogTitle>
            <DialogDescription>
              {formatQty(qty, listing.unit)} of &ldquo;{listing.title}&rdquo; is held for you. Show this single-use code
              to the provider at pickup.
            </DialogDescription>
          </DialogHeader>
          <p className="my-4 font-mono text-5xl font-bold tracking-[0.3em] text-emerald-700" data-testid="pickup-code">
            {successCode}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setSuccessCode(null)}>
              Close
            </Button>
            <Button className="flex-1" onClick={() => { setSuccessCode(null); navigate('reservations') }}>
              My reservations
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
