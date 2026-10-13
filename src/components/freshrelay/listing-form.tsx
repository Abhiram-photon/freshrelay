'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/lib/client/store'
import { useMe, useListing, useInvalidate } from './hooks'
import { api, ApiErrorClient } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { PageSkeleton, ErrorState } from './bits'
import { toLocalInput, fromLocalInput, CATEGORY_META, ALLERGEN_LABELS, STORAGE_META } from '@/lib/client/format'
import { toast } from 'sonner'
import { ArrowLeft, Navigation, Info, Eye } from 'lucide-react'

const ALLERGEN_KEYS = Object.keys(ALLERGEN_LABELS)

export function ListingForm({ editId }: { editId?: string }) {
  const { navigate } = useAppStore()
  const { data: me } = useMe()
  const editing = !!editId
  const existing = useListing(editId ?? null)
  const invalidate = useInvalidate()

  const org = me?.organization
  const orgApproved = org?.verificationStatus === 'APPROVED'

  const defaultWindowStart = () => {
    const d = new Date(Date.now() + 2 * 3_600_000)
    d.setSeconds(0, 0)
    return toLocalInput(d.toISOString())
  }
  const defaultWindowEnd = () => {
    const d = new Date(Date.now() + 6 * 3_600_000)
    d.setSeconds(0, 0)
    return toLocalInput(d.toISOString())
  }

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'BAKED_GOODS',
    quantityTotal: '10',
    unit: 'kg',
    storageType: 'AMBIENT',
    pickupAddress: '',
    lat: org ? String(org.lat) : '17.385',
    lng: org ? String(org.lng) : '78.4867',
    windowStart: defaultWindowStart(),
    windowEnd: defaultWindowEnd(),
    pickupInstructions: '',
    photoUrl: '',
    publish: false,
  })
  const [allergens, setAllergens] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)

  // Prefill for edit + once org data arrives for create
  useEffect(() => {
    if (editing && existing.data && !loaded) {
      const l = existing.data.listing
      setForm((f) => ({
        ...f,
        title: l.title,
        description: l.description,
        category: l.category,
        quantityTotal: String(l.quantityTotal),
        unit: l.unit,
        storageType: l.storageType,
        pickupAddress: l.pickupAddress ?? '',
        lat: String(l.location.lat),
        lng: String(l.location.lng),
        windowStart: toLocalInput(l.windowStart),
        windowEnd: toLocalInput(l.windowEnd),
        pickupInstructions: l.pickupInstructions ?? '',
        photoUrl: l.photoUrl ?? '',
      }))
      setAllergens(l.allergens)
      setLoaded(true)
    }
    if (!editing && org && form.pickupAddress === '') {
      setForm((f) => ({
        ...f,
        pickupAddress: org.address,
        lat: String(org.lat),
        lng: String(org.lng),
      }))
    }
     
  }, [editing, existing.data, org])

  function set(patch: Partial<typeof form>) {
    setForm((f) => ({ ...f, ...patch }))
  }

  function useMyLocation() {
    if (!navigator.geolocation) return toast.error('Geolocation unavailable')
    navigator.geolocation.getCurrentPosition(
      (pos) => set({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) }),
      () => toast.error('Could not get location')
    )
  }

  function validate(): string | null {
    if (form.title.trim().length < 3) return 'Title must be at least 3 characters'
    if (!form.description.trim()) return 'Description is required'
    const qty = Number(form.quantityTotal)
    if (!Number.isFinite(qty) || qty <= 0) return 'Quantity must be a positive number'
    if (!form.pickupAddress.trim() || form.pickupAddress.trim().length < 4) return 'Pickup address is required'
    const lat = Number(form.lat), lng = Number(form.lng)
    if (lat < -90 || lat > 90) return 'Latitude must be between -90 and 90'
    if (lng < -180 || lng > 180) return 'Longitude must be between -180 and 180'
    const start = new Date(form.windowStart).getTime()
    const end = new Date(form.windowEnd).getTime()
    if (!start || !end) return 'Collection window is required'
    if (end <= start) return 'Window end must be after start'
    if (!editing && end <= Date.now()) return 'Window end must be in the future'
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    setBusy(true)
    try {
      const body = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        quantityTotal: Number(form.quantityTotal),
        unit: form.unit,
        allergens,
        storageType: form.storageType,
        pickupAddress: form.pickupAddress.trim(),
        lat: Number(form.lat),
        lng: Number(form.lng),
        windowStart: fromLocalInput(form.windowStart),
        windowEnd: fromLocalInput(form.windowEnd),
        pickupInstructions: form.pickupInstructions || undefined,
        photoUrl: form.photoUrl || undefined,
        ...(editing ? {} : { publish: form.publish }),
      }
      if (editing) {
        await api(`/listings/${editId}`, { method: 'PATCH', body: { ...body, version: existing.data?.listing.version } })
        toast.success('Listing updated')
      } else {
        await api('/listings', { method: 'POST', body })
        toast.success(form.publish ? 'Listing published — nearby recipients notified' : 'Draft saved')
      }
      invalidate('my-listings', 'listings', 'listing', 'notifications')
      navigate('provider')
    } catch (err) {
      if (err instanceof ApiErrorClient && err.code === 'VALIDATION_ERROR') {
        const details = err.details as { path: string; message: string }[] | undefined
        setError(details?.map((d) => `${d.path}: ${d.message}`).join('; ') ?? err.message)
      } else {
        setError(err instanceof ApiErrorClient ? err.message : 'Save failed')
      }
    } finally {
      setBusy(false)
    }
  }

  if (editing && existing.isLoading) return <PageSkeleton />
  if (editing && (existing.isError || !existing.data)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <ErrorState message="Listing not found or not yours to edit." onRetry={() => navigate('provider')} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Button variant="ghost" size="sm" className="mb-4 gap-2" onClick={() => navigate('provider')}>
        <ArrowLeft className="size-4" aria-hidden /> Back to dashboard
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{editing ? 'Edit listing' : 'New listing'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5" noValidate>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {!editing && !orgApproved && (
              <Alert>
                <Info className="size-4" aria-hidden />
                <AlertTitle>You can save a draft now</AlertTitle>
                <AlertDescription>Publishing is enabled once an admin approves your organization.</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="f-title">Title</Label>
              <Input id="f-title" required maxLength={120} placeholder="e.g. Fresh sourdough loaves (30)" value={form.title} onChange={(e) => set({ title: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f-desc">Description</Label>
              <textarea
                id="f-desc"
                required
                rows={3}
                maxLength={2000}
                placeholder="What is it, how was it stored, anything collectors should know…"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => set({ category: v })}>
                  <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_META).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-qty">Quantity</Label>
                <Input id="f-qty" type="number" min="1" step="1" required value={form.quantityTotal} onChange={(e) => set({ quantityTotal: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={form.unit} onValueChange={(v) => set({ unit: v })}>
                  <SelectTrigger aria-label="Unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['kg', 'g', 'litre', 'item', 'loaf', 'portion', 'tray', 'box', 'meal'].map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Allergens (select all that apply)</Label>
              <div className="flex flex-wrap gap-1.5">
                {ALLERGEN_KEYS.map((a) => {
                  const active = allergens.includes(a)
                  return (
                    <button
                      type="button"
                      key={a}
                      aria-pressed={active}
                      onClick={() => setAllergens((cur) => (active ? cur.filter((x) => x !== a) : [...cur, a]))}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                        active ? 'border-orange-400 bg-orange-100 text-orange-800' : 'bg-background hover:bg-muted'
                      }`}
                    >
                      {ALLERGEN_LABELS[a]}
                    </button>
                  )
                })}
                <button
                  type="button"
                  aria-pressed={allergens.length === 0}
                  onClick={() => setAllergens([])}
                  className={`rounded-full border px-2.5 py-1 text-xs ${allergens.length === 0 ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'bg-background hover:bg-muted'}`}
                >
                  None declared
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Storage type</Label>
                <Select value={form.storageType} onValueChange={(v) => set({ storageType: v })}>
                  <SelectTrigger aria-label="Storage type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STORAGE_META).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-photo">Photo URL (optional)</Label>
                <Input id="f-photo" type="url" placeholder="https://…" value={form.photoUrl} onChange={(e) => set({ photoUrl: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f-address">Pickup address</Label>
              <Input id="f-address" required value={form.pickupAddress} onChange={(e) => set({ pickupAddress: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="f-lat">Latitude</Label>
                <Input id="f-lat" type="number" step="0.00001" min={-90} max={90} required value={form.lat} onChange={(e) => set({ lat: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-lng">Longitude</Label>
                <Input id="f-lng" type="number" step="0.00001" min={-180} max={180} required value={form.lng} onChange={(e) => set({ lng: e.target.value })} />
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={useMyLocation}>
              <Navigation className="size-4" aria-hidden /> Use my current location
            </Button>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="f-ws">Window opens</Label>
                <Input id="f-ws" type="datetime-local" required value={form.windowStart} onChange={(e) => set({ windowStart: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-we">Window closes</Label>
                <Input id="f-we" type="datetime-local" required value={form.windowEnd} onChange={(e) => set({ windowEnd: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Times follow your device timezone and are stored in UTC. The listing auto-expires when the window closes.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="f-instructions">Pickup instructions (optional)</Label>
              <Input id="f-instructions" maxLength={500} placeholder="e.g. Ring the bell at the side door" value={form.pickupInstructions} onChange={(e) => set({ pickupInstructions: e.target.value })} />
            </div>

            {!editing && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <Eye className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
                  <div>
                    <p className="text-sm font-medium">Publish immediately</p>
                    <p className="text-xs text-muted-foreground">
                      {orgApproved ? 'Visible to nearby recipients right away.' : 'Requires an approved organization.'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={form.publish}
                  onCheckedChange={(v) => set({ publish: v })}
                  disabled={!orgApproved}
                  aria-label="Publish immediately"
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={busy}>
                {busy ? 'Saving…' : editing ? 'Save changes' : form.publish ? 'Publish listing' : 'Save draft'}
              </Button>
              <Button type="button" variant="outline" onClick={() => navigate('provider')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
