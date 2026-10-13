'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { countdown, CATEGORY_META, STORAGE_META, ALLERGEN_LABELS } from '@/lib/client/format'
import { AlertTriangle, Info, RefreshCw, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Live countdown badge that re-renders every 20 s. */
export function CountdownBadge({ windowEnd, className }: { windowEnd: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(t)
  }, [])
  const c = countdown(windowEnd, now)
  return (
    <Badge
      variant={c.expired ? 'destructive' : c.urgent ? 'destructive' : 'secondary'}
      className={cn('gap-1', c.urgent && !c.expired && 'animate-pulse', className)}
      aria-label={c.text}
    >
      <Timer className="size-3" aria-hidden />
      {c.expired ? 'Expired' : c.text}
    </Badge>
  )
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  DRAFT: 'bg-stone-100 text-stone-700 border-stone-200',
  PAUSED: 'bg-amber-100 text-amber-800 border-amber-200',
  RESERVED_OUT: 'bg-violet-100 text-violet-800 border-violet-200',
  EXPIRED: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
  HIDDEN: 'bg-zinc-200 text-zinc-600 border-zinc-300',
  CONFIRMED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  COLLECTED: 'bg-teal-100 text-teal-800 border-teal-200',
  HELD: 'bg-sky-100 text-sky-800 border-sky-200',
  LOCKED: 'bg-red-100 text-red-800 border-red-200',
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
  SUSPENDED: 'bg-red-100 text-red-700 border-red-200',
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn(STATUS_STYLES[status] ?? '', className)}>
      {status === 'RESERVED_OUT' ? 'Fully reserved' : status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  )
}

export function CategoryArt({
  category,
  photoUrl,
  className,
  emojiClassName = 'text-5xl',
}: {
  category: string
  photoUrl?: string
  className?: string
  emojiClassName?: string
}) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.OTHER
  if (photoUrl) {
     
    return <img src={photoUrl} alt="" className={cn('object-cover', className)} loading="lazy" />
  }
  return (
    <div
      aria-hidden
      className={cn('flex items-center justify-center bg-gradient-to-br', meta.gradient, className)}
    >
      <span className={emojiClassName}>{meta.emoji}</span>
    </div>
  )
}

export function StorageBadge({ storageType }: { storageType: string }) {
  const meta = STORAGE_META[storageType] ?? { label: storageType, emoji: '📦' }
  return (
    <Badge variant="outline" className="gap-1 bg-muted/50">
      <span aria-hidden>{meta.emoji}</span>
      {meta.label}
    </Badge>
  )
}

export function AllergenChips({ allergens, max = 4 }: { allergens: string[]; max?: number }) {
  if (allergens.length === 0) return null
  const shown = allergens.slice(0, max)
  const rest = allergens.length - shown.length
  return (
    <div className="flex flex-wrap gap-1" aria-label="Allergens">
      {shown.map((a) => (
        <Badge key={a} variant="outline" className="text-[10px] px-1.5 py-0 border-orange-300 text-orange-700 bg-orange-50">
          {ALLERGEN_LABELS[a] ?? a}
        </Badge>
      ))}
      {rest > 0 && <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{rest} more</Badge>}
    </div>
  )
}

export function EmptyState({
  emoji = '🧺',
  title,
  body,
  action,
}: {
  emoji?: string
  title: string
  body?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-14 px-6 text-center">
      <span className="text-4xl" aria-hidden>{emoji}</span>
      <p className="font-semibold">{title}</p>
      {body && <p className="text-sm text-muted-foreground max-w-sm">{body}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 py-12 px-6 text-center">
      <AlertTriangle className="size-8 text-destructive" aria-hidden />
      <p className="font-semibold">Something went wrong</p>
      <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="size-4" /> Try again
        </Button>
      )}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex gap-3">
        <Skeleton className="size-20 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      <Skeleton className="h-4 w-1/3" />
    </div>
  )
}

export function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {icon && <span className="text-primary" aria-hidden>{icon}</span>}
      </div>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      {sub && (
        <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
          <Info className="size-3 mt-0.5 shrink-0" aria-hidden />
          {sub}
        </p>
      )}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="h-8 w-48 rounded bg-muted animate-pulse" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-xl border bg-muted/40 animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-xl border bg-muted/30 animate-pulse" />
    </div>
  )
}
