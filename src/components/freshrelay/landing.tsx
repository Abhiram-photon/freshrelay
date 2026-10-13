'use client'

import { useAppStore } from '@/lib/client/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Timer,
  MapPin,
  ShieldCheck,
  BarChart3,
  Store,
  ShoppingBasket,
  ArrowRight,
  HandHeart,
} from 'lucide-react'

export function Landing() {
  const { navigate } = useAppStore()
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="border-b bg-gradient-to-b from-emerald-50 via-background to-background">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 lg:grid-cols-2 lg:items-center lg:py-20">
          <div className="space-y-6">
            <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-800">
              <HandHeart className="size-3.5" aria-hidden /> Food rescue platform
            </Badge>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
              Rescue good food
              <span className="block text-emerald-700">before it goes to waste.</span>
            </h1>
            <p className="max-w-prose text-muted-foreground">
              The UNEP Food Waste Index estimated that <strong className="text-foreground">1.05 billion tonnes of
              food were wasted in 2022</strong> across households, food service and retail. FreshRelay connects
              businesses and households with surplus food to food banks, charities, shelters and community kitchens —
              making every kilo easy to list, find, reserve and collect in time.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => navigate('browse')} className="gap-2">
                <ShoppingBasket className="size-5" aria-hidden /> Browse surplus food
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('register')} className="gap-2">
                <Store className="size-5" aria-hidden /> List your surplus
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              New here? Organizations are verified by an admin before reserving or publishing.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2" aria-hidden>
            <HeroCard emoji="🥖" title="Bakeries & cafés" body="Morning bread that would be tossed at closing time." />
            <HeroCard emoji="🥕" title="Groceries & markets" body="Grade-B produce and near best-before dairy." delay="sm:mt-6" />
            <HeroCard emoji="🍛" title="Caterers & events" body="Trays of prepared meals from cancelled orders." delay="sm:mt-0" />
            <HeroCard emoji="🏘️" title="Households" body="Extra food from parties, harvests and pantries." delay="sm:mt-6" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
        <p className="mt-1 text-muted-foreground">From surplus shelf to served plate in four steps.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <HowColumn
            title="For providers"
            icon={<Store className="size-4" />}
            steps={[
              ['List your surplus', 'Title, quantity, allergens, storage type and a collection window. Countdown badges create urgency.'],
              ['Get matched', 'Nearby recipients see your listing sorted by distance and urgency — approximate location only.'],
              ['Verify at pickup', 'The recipient shows a single-use 6-digit code. You confirm — stock and accounting stay clean.'],
              ['Track impact', 'Only verified pickups count toward your rescue dashboard and meals-equivalent estimate.'],
            ]}
          />
          <HowColumn
            title="For recipients"
            icon={<ShoppingBasket className="size-4" />}
            steps={[
              ['Browse nearby', 'Live map and filters for radius, category, storage and time left.'],
              ['Reserve what you need', 'Full or partial quantity with a pickup slot inside the collection window. Stock is held for you.'],
              ['Collect with a code', 'Show your 6-digit code at pickup. The provider verifies it in seconds.'],
              ['Prove your impact', 'Every verified pickup feeds your monthly rescue chart and meals estimate.'],
            ]}
          />
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-bold tracking-tight">Built for trust and speed</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={<Timer className="size-5" />}
              title="Expiring listings"
              body="Listings auto-expire when the collection window closes and never show stale stock. Countdown badges everywhere."
            />
            <FeatureCard
              icon={<MapPin className="size-5" />}
              title="Distance matching"
              body="Search 1–50 km with nearest, ending-soon and best-match ranking. Exact addresses are revealed only after a confirmed reservation."
            />
            <FeatureCard
              icon={<ShieldCheck className="size-5" />}
              title="Verified pickups"
              body="Hashed single-use 6-digit codes, lockout after 5 failed attempts, audit logs and admin moderation."
            />
            <FeatureCard
              icon={<BarChart3 className="size-5" />}
              title="Impact dashboards"
              body="Kilos rescued, pickups, and a clearly-labelled meals estimate (1 meal ≈ 0.4 kg). Providers and recipients each see their own numbers."
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center sm:p-12">
            <h2 className="text-2xl font-bold tracking-tight">One billion tonnes is everyone&apos;s problem.</h2>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Whether you run a bakery with leftover loaves or a community kitchen feeding a neighbourhood — FreshRelay
              gives you the tooling to move good food to the people who need it.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={() => navigate('register')} className="gap-2">
                Create an account <ArrowRight className="size-4" aria-hidden />
              </Button>
              <Button variant="outline" onClick={() => navigate('login')}>
                Demo logins
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function HeroCard({ emoji, title, body, delay }: { emoji: string; title: string; body: string; delay?: string }) {
  return (
    <Card className={`${delay ?? ''} border-emerald-100`}>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="text-3xl" aria-hidden>{emoji}</span>
        <div>
          <p className="font-semibold leading-tight">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function HowColumn({
  title,
  icon,
  steps,
}: {
  title: string
  icon: React.ReactNode
  steps: [string, string][]
}) {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-emerald-600/10 text-emerald-700">{icon}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <ol className="mt-4 space-y-4">
        {steps.map(([t, b], i) => (
          <li key={t} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-semibold">{t}</p>
              <p className="text-sm text-muted-foreground">{b}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <span className="grid size-9 place-items-center rounded-lg bg-emerald-600/10 text-emerald-700">{icon}</span>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  )
}
