'use client'

import dynamic from 'next/dynamic'

// The whole FreshRelay SPA lives behind a client-only boundary so Leaflet and
// browser-only APIs never run during SSR.
const FreshRelayApp = dynamic(() => import('@/components/freshrelay/app').then((m) => m.FreshRelayApp), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" aria-hidden />
        <span className="text-sm font-medium">Loading FreshRelay…</span>
      </div>
    </div>
  ),
})

export default function Home() {
  return <FreshRelayApp />
}
