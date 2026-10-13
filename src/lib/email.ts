import { appendFileSync, mkdirSync } from 'fs'
import path from 'path'

/**
 * Pluggable email adapter. In this environment the "dev adapter" writes every
 * message to STDOUT and to `emails.outbox.log` at the project root (one JSON
 * object per line). Swap `emailAdapter` for an SMTP/Resend/etc. adapter in
 * production — callers only depend on the `send` interface.
 */

export interface EmailMessage {
  to: string
  subject: string
  body: string
}

export interface EmailAdapter {
  send(message: EmailMessage): Promise<void>
}

const OUTBOX_DIR = path.join(process.cwd(), '.mail')
const OUTBOX_FILE = path.join(OUTBOX_DIR, 'outbox.log')

class DevEmailAdapter implements EmailAdapter {
  async send(message: EmailMessage): Promise<void> {
    const line = JSON.stringify({ at: new Date().toISOString(), ...message })
    console.log(`[email] to=${message.to} subject="${message.subject}"`)
    try {
      mkdirSync(OUTBOX_DIR, { recursive: true })
      appendFileSync(OUTBOX_FILE, line + '\n')
    } catch (err) {
      console.error('[email] failed to append to outbox file', err)
    }
  }
}

export const emailAdapter: EmailAdapter = new DevEmailAdapter()

export const EMAIL_OUTBOX_PATH = OUTBOX_FILE
