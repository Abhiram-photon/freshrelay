/**
 * Next.js instrumentation hook — runs once per server process.
 * Starts the FreshRelay background worker (job queue drain + periodic sweeps:
 * expire listings, release timed-out holds, expire uncollected pickups,
 * "expiring soon" alerts, hourly digests).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.FRESHRELAY_DISABLE_WORKER === '1') return
  const { startWorker } = await import('@/lib/jobs-worker')
  startWorker()
}
