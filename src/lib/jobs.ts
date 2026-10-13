import { db } from './db'

/**
 * DB-backed job queue. The worker loop lives in src/lib/jobs-worker.ts and is
 * started from src/instrumentation.ts. Job types:
 *  - SEND_EMAIL            { to, subject, body }
 *  - DIGEST                { userId } — rate-limited nearby-listing digest
 *  - EXPIRE_LISTINGS       periodic sweep (also runs inline on reads)
 *  - RELEASE_HOLDS         periodic sweep for timed-out HELD reservations
 *  - EXPIRE_RESERVATIONS   periodic sweep for uncollected reservations
 *  - EXPIRING_SOON_ALERTS  periodic sweep for listings closing within 1 h
 */
export type JobType =
  | 'SEND_EMAIL'
  | 'DIGEST'
  | 'EXPIRE_LISTINGS'
  | 'RELEASE_HOLDS'
  | 'EXPIRE_RESERVATIONS'
  | 'EXPIRING_SOON_ALERTS'

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown> = {},
  runAt: Date = new Date()
): Promise<void> {
  try {
    await db.job.create({
      data: { type, payloadJson: JSON.stringify(payload), runAt },
    })
  } catch (err) {
    console.error('[jobs] failed to enqueue job', type, err)
  }
}
