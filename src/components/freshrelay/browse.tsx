'use client'

import { useMemo, useState } from 'react'
import { useAppStore } from '@/lib/client/store'
import { useMe, useListings } from './hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CountdownBadge, CategoryArt, StorageBadge, AllergenChips, EmptyState, ErrorState, CardSkeleton } from './bits'
import { FreshMap, MapListing } from './map'
import { formatQty, CATEGORY_META, ORG_TYPE_LABELS } from '@/lib/client/format'
import type { ListingDTO } from '@/lib/client/api'
import { Search, MapPin, RotateCcw, List, Map as MapIcon } from 'lucide-react'

const DEFAULT_CENTER = { lat: 17.385, lng: 78.4867 } // Hyderabad

export function Browse() {
  const { filters, setFilters, resetFilters, navigate } = useAppStore()
  const { data: me } = useMe()

  const org = me?.organization
  const center = useMemo(
    () => (org ? { lat: org.lat, lng: org.lng } : DEFAULT_CENTER),
    [org?.lat, org?.lng]  
  )
  const hasCoords = !!org || false // anonymous users see city center with default radius

  const query = useListings(filters, hasCoords ? center.lat : null, hasCoords ? center.lng : null)
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list')

  const items = query.data?.items ?? []
  const mapListings: MapListing[] = useMemo(
    () =>
      items.map((l) => ({
        id: l.id,
        title: l.title,
        lat: l.location.lat,
        lng: l.location.lng,
        category: l.category,
        distanceKm: l.distanceKm,
        urgent: new Date(l.windowEnd).getTime() - Date.now() < 60 * 60_000,
      })),
    [items]
  )

  const activeFilterCount =
    (filters.q ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.storage ? 1 : 0) +
    (filters.timeLeft ? 1 : 0) +
    (filters.radiusKm !== 5 ? 1 : 0) +
    (filters.sort !== 'best_match' ? 1 : 0)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Browse surplus food</h1>
          <p className="text-sm text-muted-foreground">
            {hasCoords ? `Within ${filters.radiusKm} km of ${org?.name}` : `Showing ${org ? '' : 'all of '}Hyderabad — log in to sort by your distance`}
          </p>
        </div>
        <div className="hidden lg:flex items-center gap-2 text-sm text-muted-foreground">
          <List className="size-4" aria-hidden /> list + <MapIcon className="size-4" aria-hidden /> map
        </div>
      </div>

      {/* Filters */}
      <div className="mt-4 space-y-3 rounded-xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Search bread, yogurt, meals…"
              value={filters.q}
              onChange={(e) => setFilters({ q: e.target.value })}
              className="pl-9"
              aria-label="Search listings"
            />
          </div>
          <Select value={filters.category || 'all'} onValueChange={(v) => setFilters({ category: v === 'all' ? '' : v })}>
            <SelectTrigger aria-label="Category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {Object.entries(CATEGORY_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.timeLeft || 'any'}
            onValueChange={(v) => setFilters({ timeLeft: v === 'any' ? '' : v })}
          >
            <SelectTrigger aria-label="Time left">
              <SelectValue placeholder="Time left" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any time left</SelectItem>
              <SelectItem value="1h">≤ 1 hour</SelectItem>
              <SelectItem value="3h">≤ 3 hours</SelectItem>
              <SelectItem value="6h">≤ 6 hours</SelectItem>
              <SelectItem value="24h">≤ 24 hours</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.sort} onValueChange={(v) => setFilters({ sort: v as typeof filters.sort })}>
            <SelectTrigger aria-label="Sort">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="best_match">Best match</SelectItem>
              <SelectItem value="nearest">Nearest</SelectItem>
              <SelectItem value="ending_soon">Ending soon</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <Label htmlFor="radius" className="text-xs text-muted-foreground">
              Radius: {filters.radiusKm} km
            </Label>
            <Slider
              id="radius"
              min={1}
              max={50}
              step={1}
              value={[filters.radiusKm]}
              onValueChange={([v]) => setFilters({ radiusKm: v })}
              className="mt-2"
              disabled={!hasCoords}
              aria-label="Search radius in kilometres"
            />
          </div>
          <Select value={filters.storage || 'all'} onValueChange={(v) => setFilters({ storage: v === 'all' ? '' : v })}>
            <SelectTrigger className="w-[150px]" aria-label="Storage type">
              <SelectValue placeholder="Storage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any storage</SelectItem>
              <SelectItem value="AMBIENT">Ambient</SelectItem>
              <SelectItem value="CHILLED">Chilled</SelectItem>
              <SelectItem value="FROZEN">Frozen</SelectItem>
              <SelectItem value="HOT">Hot</SelectItem>
            </SelectContent>
          </Select>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1.5">
              <RotateCcw className="size-4" aria-hidden /> Reset ({activeFilterCount})
            </Button>
          )}
        </div>
      </div>

      {/* Mobile list/map switch */}
      <div className="mt-4 lg:hidden">
        <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as 'list' | 'map')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list" className="gap-1.5"><List className="size-4" aria-hidden /> List</TabsTrigger>
            <TabsTrigger value="map" className="gap-1.5"><MapIcon className="size-4" aria-hidden /> Map</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* List */}
        <div className={`${mobileTab === 'list' ? '' : 'hidden'} lg:block`}>
          {query.isLoading ? (
            <div className="space-y-3">{[0, 1, 2].map((i) => <CardSkeleton key={i} />)}</div>
          ) : query.isError ? (
            <ErrorState
              message="Could not load listings. Check your connection and try again."
              onRetry={() => query.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              emoji="🥄"
              title="No surplus food right now"
              body={
                activeFilterCount > 0
                  ? 'Nothing matches these filters — try widening the radius or clearing filters.'
                  : 'Everything nearby has been rescued. Check back soon — new listings appear all the time.'
              }
              action={
                activeFilterCount > 0 ? (
                  <Button variant="outline" size="sm" onClick={resetFilters} className="gap-1.5">
                    <RotateCcw className="size-4" aria-hidden /> Clear filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="space-y-3" aria-live="polite">
              <p className="text-xs text-muted-foreground">
                {query.data?.total} listing{query.data?.total === 1 ? '' : 's'} · sorted by{' '}
                {filters.sort === 'best_match' ? 'best match (distance + urgency)' : filters.sort === 'nearest' ? 'distance' : 'time ending'}
              </p>
              {items.map((l) => (
                <ListingCard key={l.id} l={l} />
              ))}
            </div>
          )}
        </div>

        {/* Map */}
        <div className={`${mobileTab === 'map' ? '' : 'hidden'} lg:block`}>
          <div className="sticky top-[72px] overflow-hidden rounded-xl border">
            <div className="h-[380px] lg:h-[560px]">
              <FreshMap
                listings={mapListings}
                center={center}
                radiusKm={filters.radiusKm}
                onSelect={(id) => navigate('listing', { id })}
              />
            </div>
            <p className="border-t bg-background px-3 py-2 text-[11px] text-muted-foreground">
              Markers show <strong>approximate</strong> locations (~500 m). Exact pickup address is revealed after a
              confirmed reservation.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function ListingCard({ l }: { l: ListingDTO }) {
  const { navigate } = useAppStore()
  const meta = CATEGORY_META[l.category] ?? CATEGORY_META.OTHER
  return (
    <Card
      className="cursor-pointer py-0 transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
      role="button"
      tabIndex={0}
      aria-label={`${l.title} by ${l.org.name}`}
      onClick={() => navigate('listing', { id: l.id })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate('listing', { id: l.id })
        }
      }}
    >
      <CardContent className="flex gap-4 p-4">
        <CategoryArt category={l.category} className="hidden size-24 shrink-0 rounded-lg sm:flex" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{l.title}</h3>
            <CountdownBadge windowEnd={l.windowEnd} />
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="size-3" aria-hidden />
              {l.distanceKm != null ? `${l.distanceKm} km` : `${l.org.name}`}
            </span>
            <span>· {l.org.name}</span>
            <span>· {ORG_TYPE_LABELS[l.org.type] ?? l.org.type}</span>
          </p>
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{l.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <span aria-hidden>{meta.emoji}</span> {formatQty(l.quantityRemaining, l.unit)} left
            </Badge>
            <StorageBadge storageType={l.storageType} />
            <AllergenChips allergens={l.allergens} max={3} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
