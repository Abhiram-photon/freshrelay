'use client'

import { useEffect, useState } from 'react'
import { useAppStore, View } from '@/lib/client/store'
import { useMe, useLogout, useNotifications, useInvalidate } from './hooks'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/client/api'
import { notificationText } from '@/lib/client/format'
import { toast } from 'sonner'
import {
  Sprout,
  Bell,
  LogOut,
  Trash2,
  BarChart3,
  Store,
  ShoppingBasket,
  ShieldCheck,
  Search,
} from 'lucide-react'
import { Landing } from './landing'
import { AuthViews } from './auth'
import { Browse } from './browse'
import { ListingDetail } from './listing'
import { ProviderDashboard } from './provider'
import { ListingForm } from './listing-form'
import { VerifyPickup } from './verify'
import { MyReservations } from './reservations'
import { ImpactView } from './impact'
import { AdminConsole } from './admin'
import { NotificationsPage } from './notifications'
import { LegalView } from './legal'
import { PageSkeleton } from './bits'

export function FreshRelayApp() {
  const { view, params, navigate } = useAppStore()
  const { data: me, isLoading } = useMe()
  const notifQuery = useNotifications(!!me)
  const unread = notifQuery.data?.unread ?? me?.unreadNotifications ?? 0

  // tick for countdowns in header area
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  const role = me?.user.role
  const orgStatus = me?.organization?.verificationStatus

  function guard(allowed: string[]): React.ReactNode {
    if (isLoading) return <PageSkeleton />
    if (!me) {
      return (
        <div className="mx-auto max-w-md py-20 text-center space-y-4">
          <p className="text-lg font-semibold">Please log in</p>
          <p className="text-sm text-muted-foreground">You need an account to access this page.</p>
          <Button onClick={() => navigate('login')}>Log in</Button>
        </div>
      )
    }
    if (!allowed.includes(me.user.role)) {
      return (
        <div className="mx-auto max-w-md py-20 text-center space-y-4">
          <p className="text-lg font-semibold">Not available for your role</p>
          <p className="text-sm text-muted-foreground">This page is for {allowed.join(' / ').toLowerCase()} accounts.</p>
          <Button variant="outline" onClick={() => navigate('browse')}>
            Browse surplus food
          </Button>
        </div>
      )
    }
    return null
  }

  const guarded = (() => {
    switch (view) {
      case 'provider':
      case 'listing-form':
        return guard(['PROVIDER'])
      case 'verify':
        return guard(['PROVIDER'])
      case 'reservations':
        return guard(['RECIPIENT'])
      case 'admin':
        return guard(['ADMIN'])
      default:
        return null
    }
  })()

  let content: React.ReactNode
  if (guarded) {
    content = guarded
  } else {
    switch (view) {
      case 'landing':
        content = <Landing />
        break
      case 'login':
      case 'register':
      case 'reset':
      case 'reset-confirm':
        content = <AuthViews view={view} />
        break
      case 'browse':
        content = <Browse />
        break
      case 'listing':
        content = <ListingDetail id={params.id} />
        break
      case 'provider':
        content = <ProviderDashboard />
        break
      case 'listing-form':
        content = <ListingForm editId={params.id} />
        break
      case 'verify':
        content = <VerifyPickup initialReservationId={params.reservationId} />
        break
      case 'reservations':
        content = <MyReservations />
        break
      case 'impact':
        content = <ImpactView />
        break
      case 'admin':
        content = <AdminConsole />
        break
      case 'notifications':
        content = <NotificationsPage />
        break
      case 'privacy':
      case 'terms':
      case 'food-safety':
        content = <LegalView view={view} />
        break
      default:
        content = <Landing />
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded-md"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <button
            onClick={() => navigate('landing')}
            className="flex items-center gap-2 rounded-md px-1 py-1 font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
            aria-label="FreshRelay home"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-emerald-600 text-white">
              <Sprout className="size-5" aria-hidden />
            </span>
            <span className="hidden sm:block text-lg">FreshRelay</span>
          </button>

          <nav className="ml-2 flex items-center gap-1 overflow-x-auto" aria-label="Main">
            <HeaderLink view="browse" icon={<Search className="size-4" />}>
              Browse
            </HeaderLink>
            {role === 'PROVIDER' && (
              <HeaderLink view="provider" icon={<Store className="size-4" />}>
                Dashboard
              </HeaderLink>
            )}
            {role === 'RECIPIENT' && (
              <HeaderLink view="reservations" icon={<ShoppingBasket className="size-4" />}>
                Reservations
              </HeaderLink>
            )}
            {role === 'ADMIN' && (
              <HeaderLink view="admin" icon={<ShieldCheck className="size-4" />}>
                Admin
              </HeaderLink>
            )}
            {me && (
              <HeaderLink view="impact" icon={<BarChart3 className="size-4" />}>
                <span className="hidden md:inline">Impact</span>
                <span className="md:hidden">Impact</span>
              </HeaderLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {me ? (
              <>
                <NotificationsBell unread={unread} />
                <UserMenu name={me.user.name} email={me.user.email} role={me.user.role} />
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('login')}>
                  Log in
                </Button>
                <Button size="sm" onClick={() => navigate('register')}>
                  Sign up
                </Button>
              </>
            )}
          </div>
        </div>
        {me && orgStatus === 'PENDING' && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900">
            <p className="mx-auto max-w-6xl px-4 py-1.5 text-xs sm:text-sm">
              <strong>{me.organization?.name}</strong> is awaiting verification.{' '}
              {role === 'RECIPIENT'
                ? 'You can browse surplus food, but reserving unlocks once an admin approves your organization.'
                : 'You can draft listings, but publishing unlocks once an admin approves your organization.'}
            </p>
          </div>
        )}
        {me && orgStatus === 'REJECTED' && (
          <div className="bg-red-50 border-b border-red-200 text-red-900">
            <p className="mx-auto max-w-6xl px-4 py-1.5 text-xs sm:text-sm">
              <strong>{me.organization?.name}</strong> was not approved.
              {me.organization?.verificationNote ? ` Note: ${me.organization.verificationNote}` : ''}
            </p>
          </div>
        )}
      </header>

      <main id="main" className="flex-1">
        {content}
      </main>

      <footer className="mt-auto border-t bg-muted/40 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted-foreground space-y-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button className="underline underline-offset-2 hover:text-foreground" onClick={() => navigate('privacy')}>
              Privacy notice
            </button>
            <button className="underline underline-offset-2 hover:text-foreground" onClick={() => navigate('terms')}>
              Terms
            </button>
            <button className="underline underline-offset-2 hover:text-foreground" onClick={() => navigate('food-safety')}>
              Food-safety disclaimer
            </button>
            <span className="ml-auto">© {new Date().getFullYear()} FreshRelay — demo build</span>
          </div>
          <p>
            Food-safety: providers are responsible for the accuracy of allergen information and the safety of donated
            food. Always inspect food at pickup.
          </p>
        </div>
      </footer>
    </div>
  )
}

function HeaderLink({
  view,
  icon,
  children,
}: {
  view: View
  icon: React.ReactNode
  children: React.ReactNode
}) {
  const { view: current, navigate } = useAppStore()
  const active = current === view
  return (
    <button
      onClick={() => navigate(view)}
      aria-current={active ? 'page' : undefined}
      className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
        active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

function NotificationsBell({ unread }: { unread: number }) {
  const { navigate } = useAppStore()
  return (
    <button
      onClick={() => navigate('notifications')}
      className="relative grid size-9 place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
    >
      <Bell className="size-5" aria-hidden />
      {unread > 0 && (
        <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] leading-4 bg-red-600 hover:bg-red-600">
          {unread > 9 ? '9+' : unread}
        </Badge>
      )}
    </button>
  )
}

function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const { navigate } = useAppStore()
  const logout = useLogout()
  const invalidate = useInvalidate()
  const [open, setOpen] = useState(false)

  async function deleteAccount() {
    try {
      await api('/auth/me', { method: 'DELETE', body: {} })
      logout.mutate()
      toast.success('Account deleted and anonymized')
      navigate('landing')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete account')
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="grid size-9 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="Account menu"
        >
          {name.slice(0, 1).toUpperCase()}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground font-normal truncate">{email}</p>
          <p className="text-xs text-muted-foreground font-normal">{role}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(role === 'PROVIDER' ? 'provider' : role === 'ADMIN' ? 'admin' : 'browse')}>
          <Store className="size-4" /> {role === 'PROVIDER' ? 'Provider dashboard' : role === 'ADMIN' ? 'Admin console' : 'Browse'}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('impact')}>
          <BarChart3 className="size-4" /> My impact
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('notifications')}>
          <Bell className="size-4" /> Notifications
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-red-600 focus:text-red-600">
              <Trash2 className="size-4" /> Delete account
            </DropdownMenuItem>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                Your personal data will be anonymized, sessions revoked and your active listings cancelled. This cannot
                be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep account</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={(e) => {
                  e.preventDefault()
                  setOpen(false)
                  void deleteAccount()
                }}
              >
                Delete forever
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <DropdownMenuItem
          className="text-red-600 focus:text-red-600"
          onClick={() => {
            logout.mutate()
            toast.success('Logged out')
            navigate('landing')
          }}
        >
          <LogOut className="size-4" /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
