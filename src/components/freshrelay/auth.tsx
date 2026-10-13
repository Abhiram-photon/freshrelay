'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/client/store'
import { api, ApiErrorClient, Me } from '@/lib/client/api'
import { useMe, useInvalidate } from './hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Store, ShoppingBasket, Mail, Lock, User, Phone, MapPin, Navigation, Info, KeyRound } from 'lucide-react'

const PROVIDER_TYPES = ['BAKERY', 'GROCERY', 'CATERER', 'RESTAURANT', 'HOUSEHOLD']
const RECIPIENT_TYPES = ['FOOD_BANK', 'CHARITY', 'SHELTER', 'COMMUNITY_KITCHEN']

const TYPE_LABELS: Record<string, string> = {
  BAKERY: 'Bakery', GROCERY: 'Grocery store', CATERER: 'Caterer', RESTAURANT: 'Restaurant', HOUSEHOLD: 'Household',
  FOOD_BANK: 'Food bank', CHARITY: 'Charity', SHELTER: 'Shelter', COMMUNITY_KITCHEN: 'Community kitchen',
}

const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@freshrelay.test', password: 'Admin123!' },
  { label: 'Provider', email: 'lakshmi@freshrelay.test', password: 'Demo1234!' },
  { label: 'Recipient', email: 'anna@freshrelay.test', password: 'Demo1234!' },
  { label: 'Pending recipient', email: 'bright@freshrelay.test', password: 'Demo1234!' },
]

export function AuthViews({ view }: { view: 'login' | 'register' | 'reset' | 'reset-confirm' }) {
  if (view === 'login') return <LoginView />
  if (view === 'register') return <RegisterView />
  if (view === 'reset') return <ResetRequestView />
  return <ResetConfirmView />
}

function afterLogin(me: Me) {
  const { navigate } = useAppStore.getState()
  if (me.user.role === 'ADMIN') navigate('admin')
  else if (me.user.role === 'PROVIDER') navigate('provider')
  else navigate('browse')
}

function LoginView() {
  const { navigate } = useAppStore()
  const { refetch } = useMe()
  const invalidate = useInvalidate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const me = await api<Me>('/auth/login', { method: 'POST', body: { email, password } })
      invalidate('me', 'notifications')
      toast.success(`Welcome back, ${me.user.name}!`)
      afterLogin(me)
    } catch (err) {
      setError(err instanceof ApiErrorClient ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  function fillDemo(acc: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(acc.email)
    setPassword(acc.password)
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-4 py-10 md:grid-cols-[1fr_300px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Log in to FreshRelay</CardTitle>
          <CardDescription>Rescue food, track impact, verify pickups.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="email" type="email" required autoComplete="email" className="pl-9" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="password" type="password" required autoComplete="current-password" className="pl-9" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Logging in…' : 'Log in'}
            </Button>
            <div className="flex justify-between text-sm">
              <button type="button" className="underline underline-offset-2 text-muted-foreground hover:text-foreground" onClick={() => navigate('reset')}>
                Forgot password?
              </button>
              <button type="button" className="underline underline-offset-2 text-muted-foreground hover:text-foreground" onClick={() => navigate('register')}>
                Create an account
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
      <Card className="h-fit border-dashed">
        <CardHeader>
          <CardTitle className="text-sm">Demo accounts</CardTitle>
          <CardDescription className="text-xs">Local demo only — clearly fake passwords.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.email}
              type="button"
              onClick={() => fillDemo(acc)}
              className="w-full rounded-lg border px-3 py-2 text-left text-xs hover:border-primary/40 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="font-semibold">{acc.label}</span>
              <span className="block text-muted-foreground">{acc.email}</span>
              <span className="block text-muted-foreground">{acc.password}</span>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function RegisterView() {
  const { navigate } = useAppStore()
  const [role, setRole] = useState<'PROVIDER' | 'RECIPIENT'>('RECIPIENT')
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    orgName: '',
    orgType: '',
    address: '',
    lat: '17.3850',
    lng: '78.4867',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const types = role === 'PROVIDER' ? PROVIDER_TYPES : RECIPIENT_TYPES

  function set(patch: Partial<typeof form>) {
    setForm((f) => ({ ...f, ...patch }))
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not available in this browser')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set({ lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5) })
        toast.success('Using your current location')
      },
      () => toast.error('Could not get your location — enter coordinates manually')
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.orgType) {
      setError('Please choose an organization type')
      return
    }
    setBusy(true)
    try {
      await api('/auth/register', {
        method: 'POST',
        body: {
          role,
          email: form.email,
          password: form.password,
          name: form.name,
          phone: form.phone || undefined,
          organization: {
            type: form.orgType,
            name: form.orgName,
            address: form.address,
            lat: Number(form.lat),
            lng: Number(form.lng),
          },
        },
      })
      toast.success('Account created!', { description: 'Your organization is pending verification by an administrator.' })
      navigate('login')
    } catch (err) {
      if (err instanceof ApiErrorClient && err.code === 'VALIDATION_ERROR') {
        const details = err.details as { path: string; message: string }[] | undefined
        setError(details?.map((d) => `${d.path}: ${d.message}`).join('; ') ?? err.message)
      } else {
        setError(err instanceof ApiErrorClient ? err.message : 'Registration failed')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Join FreshRelay</CardTitle>
          <CardDescription>
            Organizations start as <strong>PENDING</strong> — an admin verifies them before you can reserve or publish.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5" noValidate>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <fieldset>
              <legend className="mb-2 text-sm font-medium">I am joining as…</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <RoleCard
                  active={role === 'PROVIDER'}
                  onClick={() => { setRole('PROVIDER'); set({ orgType: '' }) }}
                  icon={<Store className="size-5" />}
                  title="Provider"
                  body="Bakery, grocery, caterer, restaurant or household with surplus food."
                />
                <RoleCard
                  active={role === 'RECIPIENT'}
                  onClick={() => { setRole('RECIPIENT'); set({ orgType: '' }) }}
                  icon={<ShoppingBasket className="size-5" />}
                  title="Recipient"
                  body="Food bank, charity, shelter, community kitchen or verified individual."
                />
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your full name" htmlFor="r-name">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input id="r-name" required minLength={2} className="pl-9" value={form.name} onChange={(e) => set({ name: e.target.value })} />
                </div>
              </Field>
              <Field label="Phone (optional)" htmlFor="r-phone">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input id="r-phone" type="tel" className="pl-9" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
                </div>
              </Field>
              <Field label="Email" htmlFor="r-email">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input id="r-email" type="email" required className="pl-9" value={form.email} onChange={(e) => set({ email: e.target.value })} />
                </div>
              </Field>
              <Field label="Password (min 8 chars)" htmlFor="r-password">
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input id="r-password" type="password" required minLength={8} className="pl-9" value={form.password} onChange={(e) => set({ password: e.target.value })} />
                </div>
              </Field>
              <Field label="Organization name" htmlFor="r-org">
                <Input id="r-org" required minLength={2} value={form.orgName} onChange={(e) => set({ orgName: e.target.value })} />
              </Field>
              <Field label="Organization type" htmlFor="r-type">
                <Select value={form.orgType} onValueChange={(v) => set({ orgType: v })}>
                  <SelectTrigger id="r-type" aria-label="Organization type">
                    <SelectValue placeholder="Choose type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Organization address" htmlFor="r-address">
              <div className="relative">
                <MapPin className="absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden />
                <textarea
                  id="r-address"
                  required
                  rows={2}
                  className="w-full rounded-md border border-input bg-transparent px-9 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  value={form.address}
                  onChange={(e) => set({ address: e.target.value })}
                />
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Latitude" htmlFor="r-lat">
                <Input id="r-lat" type="number" step="0.00001" min={-90} max={90} required value={form.lat} onChange={(e) => set({ lat: e.target.value })} />
              </Field>
              <Field label="Longitude" htmlFor="r-lng">
                <Input id="r-lng" type="number" step="0.00001" min={-180} max={180} required value={form.lng} onChange={(e) => set({ lng: e.target.value })} />
              </Field>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={useMyLocation} className="gap-2">
              <Navigation className="size-4" aria-hidden /> Use my current location
            </Button>

            <Alert>
              <Info className="size-4" aria-hidden />
              <AlertTitle>What happens next?</AlertTitle>
              <AlertDescription>
                {role === 'RECIPIENT'
                  ? 'You can browse immediately. Reserving unlocks after an admin approves your organization.'
                  : 'You can draft listings immediately. Publishing unlocks after an admin approves your organization.'}
              </AlertDescription>
            </Alert>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already registered?{' '}
              <button type="button" className="underline underline-offset-2" onClick={() => navigate('login')}>
                Log in
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function ResetRequestView() {
  const { navigate } = useAppStore()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [devToken, setDevToken] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await api<{ ok: boolean; devToken?: string }>('/auth/password-reset/request', {
        method: 'POST',
        body: { email },
      })
      setSent(true)
      if (res.devToken) setDevToken(res.devToken)
      toast.success('If that email exists, a reset token has been sent.')
    } catch (err) {
      toast.error(err instanceof ApiErrorClient ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Reset your password</CardTitle>
          <CardDescription>We&apos;ll email you a single-use token (valid 30 minutes).</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <Alert>
                <Info className="size-4" aria-hidden />
                <AlertTitle>Check your email</AlertTitle>
                <AlertDescription>In this dev environment the token is printed to the console and .mail/outbox.log.</AlertDescription>
              </Alert>
              {devToken && (
                <div className="rounded-lg border bg-muted/50 p-3 text-xs space-y-2">
                  <p className="font-semibold">Dev convenience — your token:</p>
                  <code className="block break-all rounded bg-background p-2 font-mono">{devToken}</code>
                  <Button size="sm" className="w-full gap-2" onClick={() => navigate('reset-confirm')}>
                    <KeyRound className="size-4" aria-hidden /> Continue to reset form
                  </Button>
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={() => navigate('login')}>
                Back to login
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="rs-email">Email</Label>
                <Input id="rs-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset token'}
              </Button>
              <p className="text-center text-sm">
                <button type="button" className="underline underline-offset-2 text-muted-foreground" onClick={() => navigate('login')}>
                  Back to login
                </button>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ResetConfirmView() {
  const { navigate } = useAppStore()
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/auth/password-reset/confirm', { method: 'POST', body: { token, password } })
      toast.success('Password updated — log in with your new password')
      navigate('login')
    } catch (err) {
      setError(err instanceof ApiErrorClient ? err.message : 'Reset failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Choose a new password</CardTitle>
          <CardDescription>Enter the token from your email and a new password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="rc-token">Reset token</Label>
              <Input id="rc-token" required value={token} onChange={(e) => setToken(e.target.value)} className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-password">New password (min 8 chars)</Label>
              <Input id="rc-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function RoleCard({
  active,
  onClick,
  icon,
  title,
  body,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
        active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-primary/40 hover:bg-muted/50'
      }`}
    >
      <span className={`grid size-9 place-items-center rounded-lg ${active ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
        {icon}
      </span>
      <p className="mt-2 font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
    </button>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
