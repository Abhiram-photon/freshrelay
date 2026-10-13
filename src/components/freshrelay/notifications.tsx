'use client'

import { useNotifications, useInvalidate } from './hooks'
import { useAppStore } from '@/lib/client/store'
import { api, ApiErrorClient } from '@/lib/client/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState, PageSkeleton, ErrorState } from './bits'
import { notificationText, relativeTime } from '@/lib/client/format'
import { toast } from 'sonner'
import { Bell, CheckCheck, Dot } from 'lucide-react'

const TYPE_EMOJI: Record<string, string> = {
  NEW_NEARBY_LISTING: '📍',
  RESERVATION_CREATED: '🛒',
  RESERVATION_CONFIRMED: '✅',
  RESERVATION_CANCELLED: '🚫',
  LISTING_EXPIRING_SOON: '⏰',
  PICKUP_VERIFIED: '🤝',
  ORG_APPROVED: '🎉',
  ORG_REJECTED: '❌',
  RESERVATION_LOCKED: '🔒',
  ACCOUNT_STATUS: '👤',
}

export function NotificationsPage() {
  const { navigate } = useAppStore()
  const query = useNotifications(true)
  const invalidate = useInvalidate()

  async function markRead(id: string, target?: { view: string; params?: Record<string, string> }) {
    try {
      await api(`/notifications/${id}/read`, { method: 'POST', body: {} })
      invalidate('notifications', 'me')
      if (target) {
        navigate(target.view as never, target.params)
      }
    } catch (err) {
      toast.error(err instanceof ApiErrorClient ? err.message : 'Failed')
    }
  }

  async function markAll() {
    try {
      await api('/notifications/read-all', { method: 'POST', body: {} })
      invalidate('notifications', 'me')
      toast.success('All notifications marked as read')
    } catch (err) {
      toast.error(err instanceof ApiErrorClient ? err.message : 'Failed')
    }
  }

  if (query.isLoading) return <PageSkeleton />
  if (query.isError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <ErrorState message="Could not load notifications." onRetry={() => query.refetch()} />
      </div>
    )
  }

  const items = query.data?.items ?? []
  const unread = query.data?.unread ?? 0

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Bell className="size-6" aria-hidden /> Notifications
          {unread > 0 && <Badge className="bg-red-600 hover:bg-red-600">{unread} unread</Badge>}
        </h1>
        {unread > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={markAll}>
            <CheckCheck className="size-4" aria-hidden /> Mark all read
          </Button>
        )}
      </div>

      <div className="mt-4 space-y-2" data-testid="notifications-list">
        {items.length === 0 ? (
          <EmptyState emoji="🔔" title="No notifications yet" body="Reservation updates, expiring listings and platform news land here." />
        ) : (
          items.map((n) => {
            const text = notificationText(n.type, n.payload)
            return (
              <Card
                key={n.id}
                className={`py-0 cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring ${n.read ? '' : 'border-primary/30 bg-primary/5'}`}
                role="button"
                tabIndex={0}
                aria-label={text.title}
                onClick={() => markRead(n.id, text.target)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    void markRead(n.id, text.target)
                  }
                }}
              >
                <CardContent className="flex items-start gap-3 p-3.5">
                  <span className="text-xl" aria-hidden>{TYPE_EMOJI[n.type] ?? '🔔'}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${n.read ? 'text-muted-foreground' : 'font-semibold'}`}>{text.title}</p>
                    {text.body && <p className="mt-0.5 text-xs text-muted-foreground">{text.body}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</p>
                  </div>
                  {!n.read && <Dot className="size-6 shrink-0 text-primary" aria-label="unread" />}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
