'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/client/store'
import { useAdminOrgs, useAdminUsers, useAdminListings, useAdminMetrics, useInvalidate } from './hooks'
import { api, ApiErrorClient } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatusBadge, StatCard, EmptyState, PageSkeleton, ErrorState } from './bits'
import { fmtDateTime, ORG_TYPE_LABELS } from '@/lib/client/format'
import { toast } from 'sonner'
import { Check, X, EyeOff, RotateCcw, ShieldCheck, BarChart3, Search } from 'lucide-react'

export function AdminConsole() {
  const [tab, setTab] = useState('orgs')
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <ShieldCheck className="size-6 text-primary" aria-hidden /> Admin console
      </h1>
      <p className="text-sm text-muted-foreground">Approve organizations, moderate listings, manage users.</p>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="orgs">Organizations</TabsTrigger>
          <TabsTrigger value="listings">Listings</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="metrics" className="gap-1.5">
            <BarChart3 className="size-4" aria-hidden /> Metrics
          </TabsTrigger>
        </TabsList>
        <div className="mt-4">
          {tab === 'orgs' && <OrgQueue />}
          {tab === 'listings' && <ListingModeration />}
          {tab === 'users' && <UserManager />}
          {tab === 'metrics' && <MetricsTab />}
        </div>
      </Tabs>
    </div>
  )
}

function OrgQueue() {
  const [status, setStatus] = useState('PENDING')
  const query = useAdminOrgs(status, true)
  const invalidate = useInvalidate()
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED', withNote?: string) {
    setBusy(true)
    try {
      await api(`/admin/organizations/${id}/verification`, { method: 'PATCH', body: { decision, note: withNote ?? '' } })
      toast.success(`Organization ${decision.toLowerCase()}`)
      invalidate('admin-orgs', 'notifications')
      setRejectTarget(null)
      setNote('')
    } catch (err) {
      toast.error(err instanceof ApiErrorClient ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <StatusFilter current={status} onChange={setStatus} options={['PENDING', 'APPROVED', 'REJECTED']} />
      {query.isLoading ? (
        <PageSkeleton />
      ) : query.isError ? (
        <ErrorState message="Could not load organizations." onRetry={() => query.refetch()} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <EmptyState emoji="🏛️" title={`No ${status.toLowerCase()} organizations`} />
      ) : (
        <div className="space-y-3" data-testid="admin-orgs">
          {query.data!.items.map((o) => (
            <Card key={o.id} className="py-0">
              <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{o.name}</h3>
                    <Badge variant="outline">{ORG_TYPE_LABELS[o.type] ?? o.type}</Badge>
                    <StatusBadge status={o.verificationStatus} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {o.address} · owner {o.owner.name} ({o.owner.email}) · requested {fmtDateTime(o.createdAt)}
                  </p>
                  {o.verificationNote && <p className="mt-1 text-xs text-muted-foreground">Note: {o.verificationNote}</p>}
                </div>
                <div className="flex gap-2 lg:justify-end">
                  {o.verificationStatus !== 'APPROVED' && (
                    <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => decide(o.id, 'APPROVED')}>
                      <Check className="size-4" aria-hidden /> Approve
                    </Button>
                  )}
                  {o.verificationStatus === 'PENDING' && (
                    <Button size="sm" variant="outline" className="gap-1.5 text-red-600" disabled={busy} onClick={() => setRejectTarget(o.id)}>
                      <X className="size-4" aria-hidden /> Reject
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject organization</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-note">Reason (sent to the owner)</Label>
            <Textarea id="reject-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. address could not be verified" maxLength={500} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Back</Button>
            <Button variant="destructive" disabled={busy} onClick={() => rejectTarget && decide(rejectTarget, 'REJECTED', note)}>
              {busy ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ListingModeration() {
  const [status, setStatus] = useState('')
  const query = useAdminListings(status, true)
  const invalidate = useInvalidate()
  const [busy, setBusy] = useState(false)

  async function moderate(id: string, action: 'HIDE' | 'RESTORE') {
    setBusy(true)
    try {
      await api(`/admin/listings/${id}/moderation`, { method: 'PATCH', body: { action } })
      toast.success(action === 'HIDE' ? 'Listing hidden from search' : 'Listing restored')
      invalidate('admin-listings', 'listings')
    } catch (err) {
      toast.error(err instanceof ApiErrorClient ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <StatusFilter current={status} onChange={setStatus} options={['', 'ACTIVE', 'HIDDEN', 'EXPIRED', 'CANCELLED', 'DRAFT', 'PAUSED', 'RESERVED_OUT']} />
      {query.isLoading ? (
        <PageSkeleton />
      ) : query.isError ? (
        <ErrorState message="Could not load listings." onRetry={() => query.refetch()} />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <EmptyState emoji="🗂️" title="No listings match" />
      ) : (
        <div className="space-y-3" data-testid="admin-listings">
          {query.data!.items.map((l) => (
            <Card key={l.id} className="py-0">
              <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{l.title}</h3>
                    <StatusBadge status={l.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {l.org.name} ({l.org.verificationStatus.toLowerCase()}) · {l.quantityRemaining}/{l.quantityTotal} {l.unit} left ·
                    window {fmtDateTime(l.windowStart)} → {fmtDateTime(l.windowEnd)}
                  </p>
                </div>
                <div className="flex gap-2 lg:justify-end">
                  {l.status !== 'HIDDEN' && !['CANCELLED', 'EXPIRED'].includes(l.status) && (
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => moderate(l.id, 'HIDE')}>
                      <EyeOff className="size-4" aria-hidden /> Hide
                    </Button>
                  )}
                  {l.status === 'HIDDEN' && (
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => moderate(l.id, 'RESTORE')}>
                      <RotateCcw className="size-4" aria-hidden /> Restore
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function UserManager() {
  const [q, setQ] = useState('')
  const query = useAdminUsers(q, true)
  const invalidate = useInvalidate()
  const [busy, setBusy] = useState(false)

  async function setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    setBusy(true)
    try {
      await api(`/admin/users/${id}/status`, { method: 'PATCH', body: { status } })
      toast.success(`User ${status.toLowerCase()}`)
      invalidate('admin-users')
    } catch (err) {
      toast.error(err instanceof ApiErrorClient ? err.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or name…" className="pl-9" aria-label="Search users" />
      </div>
      {query.isLoading ? (
        <PageSkeleton />
      ) : query.isError ? (
        <ErrorState message="Could not load users." onRetry={() => query.refetch()} />
      ) : (
        <div className="space-y-3" data-testid="admin-users">
          {query.data!.items.map((u) => (
            <Card key={u.id} className="py-0">
              <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{u.name}</h3>
                    <Badge variant="outline">{u.role}</Badge>
                    <StatusBadge status={u.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {u.email} · joined {fmtDateTime(u.createdAt)}
                    {u.organizations.length > 0 && ` · ${u.organizations.map((o) => `${o.name} (${o.verificationStatus.toLowerCase()})`).join(', ')}`}
                  </p>
                </div>
                <div className="flex gap-2 lg:justify-end">
                  {u.status === 'ACTIVE' ? (
                    <Button size="sm" variant="outline" className="gap-1.5 text-red-600" disabled={busy} onClick={() => setStatus(u.id, 'SUSPENDED')}>
                      Suspend
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => setStatus(u.id, 'ACTIVE')}>
                      Reactivate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function MetricsTab() {
  const metrics = useAdminMetrics(true)
  if (metrics.isLoading) return <PageSkeleton />
  if (metrics.isError || !metrics.data) return <ErrorState message="Could not load metrics." onRetry={() => metrics.refetch()} />

  const d = metrics.data
  const totalUsers = d.users.reduce((s, u) => s + u.count, 0)
  const pendingOrgs = d.organizations.find((o) => o.status === 'PENDING')?.count ?? 0
  const activeListings = d.listings.find((l) => l.status === 'ACTIVE')?.count ?? 0

  return (
    <div className="space-y-4" data-testid="admin-metrics">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={String(totalUsers)} />
        <StatCard label="Pending organizations" value={String(pendingOrgs)} sub="Awaiting verification" />
        <StatCard label="Active listings" value={String(activeListings)} />
        <StatCard label="Food rescued" value={`${d.impact.totalKg} kg`} sub={`${d.impact.pickups} verified pickups · ≈${d.impact.mealsEstimate} meals`} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Listings by status</CardTitle>
            <CardDescription>Platform-wide</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {d.listings.map((l) => (
              <Badge key={l.status} variant="secondary" className="gap-1">
                {l.status === 'RESERVED_OUT' ? 'fully reserved' : l.status.toLowerCase()}: {l.count}
              </Badge>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Reservations by status</CardTitle>
            <CardDescription>Platform-wide</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {d.reservations.map((r) => (
              <Badge key={r.status} variant="secondary">{r.status.toLowerCase()}: {r.count}</Badge>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatusFilter({
  current,
  onChange,
  options,
}: {
  current: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
      {options.map((o) => (
        <button
          key={o || 'all'}
          role="tab"
          aria-selected={current === o}
          onClick={() => onChange(o)}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
            current === o ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
          }`}
        >
          {o === '' ? 'All' : o.charAt(0) + o.slice(1).toLowerCase()}
        </button>
      ))}
    </div>
  )
}
