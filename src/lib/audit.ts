import { db } from './db'

/**
 * Append-only audit trail for admin actions and verification attempts.
 * Never throws — auditing must not break the primary operation.
 */
export async function audit(
  actorUserId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorUserId: actorUserId ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        metadataJson: JSON.stringify(sanitize(metadata)),
      },
    })
  } catch (err) {
    console.error('[audit] failed to write entry', action, entity, err)
  }
}

/** Redact anything that looks like a secret/code so it never lands in logs. */
function sanitize(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (/code|token|password|secret|hash/i.test(key)) {
      out[key] = '[redacted]'
    } else {
      out[key] = value
    }
  }
  return out
}
