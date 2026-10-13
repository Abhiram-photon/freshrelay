'use client'

import { useAppStore } from '@/lib/client/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, ShieldCheck } from 'lucide-react'

export function LegalView({ view }: { view: 'privacy' | 'terms' | 'food-safety' }) {
  const { navigate } = useAppStore()
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Button variant="ghost" size="sm" className="mb-4 gap-2" onClick={() => navigate('landing')}>
        <ArrowLeft className="size-4" aria-hidden /> Back
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>
            {view === 'privacy' ? 'Privacy notice' : view === 'terms' ? 'Terms of use' : 'Food-safety disclaimer'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          {view === 'privacy' && (
            <>
              <Section title="What we store">
                Account basics (name, email, optional phone), your organization profile and pickup coordinates, listings
                you publish, reservations you make, hashed passwords and hashed session tokens, and in-app
                notifications. Pickup codes are stored only as HMAC-SHA256 hashes — never in plain text.
              </Section>
              <Section title="Location data">
                Public listings expose only approximate coordinates (rounded to roughly 500 m). The exact pickup address
                is revealed exclusively to the confirmed recipient of a reservation and to the listing owner.
              </Section>
              <Section title="What we never do">
                We never sell personal data, never log secrets or codes, and never share your email with other users.
                Notification emails are sent only for events you opted into (nearby-listing digests are rate-limited to
                one per hour and can be disabled in your account menu).
              </Section>
              <Section title="Account deletion">
                You can delete your account from the account menu at any time. We anonymize your user record (name,
                email, phone), revoke all sessions, cancel your active listings, and keep only the aggregate impact
                statistics that no longer reference you personally.
              </Section>
            </>
          )}
          {view === 'terms' && (
            <>
              <Section title="1. Roles and verification">
                Providers (bakeries, groceries, caterers, restaurants, households) publish surplus-food listings.
                Recipients (food banks, charities, shelters, community kitchens, verified individuals) reserve and
                collect them. Every organization starts as PENDING and must be approved by an administrator before it
                can publish or reserve.
              </Section>
              <Section title="2. Reservations and pickups">
                Reserving holds stock until collection, cancellation, or expiry. Reservations are confirmed with a
                single-use 6-digit code presented at pickup. After 5 failed verification attempts a reservation locks
                and platform administrators are notified. Abusive reservation behaviour (no-shows, code guessing) may
                lead to suspension.
              </Section>
              <Section title="3. No warranty">
                FreshRelay is a coordination platform. We do not inspect, transport, or warrant any food. All listings
                are provided by their organizations &ldquo;as is&rdquo;. This demo build is provided without any
                guarantee of availability or fitness for a particular purpose.
              </Section>
              <Section title="4. Liability">
                To the maximum extent permitted by law, FreshRelay and its operators are not liable for the condition,
                safety, or legality of rescued food, nor for the actions of platform users. Providers remain fully
                responsible for the accuracy of their listings, including allergen information.
              </Section>
            </>
          )}
          {view === 'food-safety' && (
            <>
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
                <p className="flex items-center gap-2 font-semibold text-foreground">
                  <ShieldCheck className="size-4" aria-hidden /> Provider responsibility
                </p>
                <p className="mt-2">
                  Providers are responsible for the accuracy of allergen information and for the safety and handling of
                  donated food. If in doubt, leave it out — never list food you would not serve to your own family.
                </p>
              </div>
              <Section title="For providers">
                Label all 14 major allergens truthfully (gluten, crustaceans, eggs, fish, peanuts, soy, milk, tree
                nuts, celery, mustard, sesame, sulphites, lupin, molluscs). State the correct storage type (ambient,
                chilled, frozen, hot) and keep food at safe temperatures until collection. Only list food inside its
                use-by date, or past its best-before date only when quality is still good.
              </Section>
              <Section title="For recipients">
                Inspect food at pickup — you are accepting it in the condition you find it. Maintain your own cold
                chain, respect time/temperature controls, and serve rescued food promptly. When in doubt about any
                item, discard it. Your beneficiaries&apos; safety comes first.
              </Section>
              <Section title="The Good Samaritan principle">
                Many jurisdictions (e.g., the US Bill Emerson Good Samaritan Food Donation Act and similar EU/India
                guidance) protect good-faith food donors. FreshRelay&apos;s verification workflow — hashed pickup
                codes, timestamps, and audit logs — gives both sides a clear record of every handover.
              </Section>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 leading-relaxed">{children}</p>
    </div>
  )
}
