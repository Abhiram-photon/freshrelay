import { db } from './db'
import { enqueueJob } from './jobs'

/**
 * Notification fan-out: every event creates an in-app notification row and
 * (optionally) enqueues a transactional email via the job queue.
 */

export type NotificationType =
  | 'NEW_NEARBY_LISTING'
  | 'RESERVATION_CREATED'
  | 'RESERVATION_CONFIRMED'
  | 'RESERVATION_CANCELLED'
  | 'LISTING_EXPIRING_SOON'
  | 'PICKUP_VERIFIED'
  | 'ORG_APPROVED'
  | 'ORG_REJECTED'
  | 'RESERVATION_LOCKED'
  | 'ACCOUNT_STATUS'

export async function notifyUser(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown> = {},
  email?: { subject: string; body: string }
): Promise<void> {
  try {
    await db.notification.create({
      data: { userId, type, payloadJson: JSON.stringify(payload) },
    })
  } catch (err) {
    console.error('[notify] failed to create in-app notification', err)
    return
  }

  if (email) {
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true, status: true },
      })
      if (user && user.status === 'ACTIVE') {
        await enqueueJob('SEND_EMAIL', { to: user.email, subject: email.subject, body: email.body })
      }
    } catch (err) {
      console.error('[notify] failed to enqueue email', err)
    }
  }
}
