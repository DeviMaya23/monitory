import { randomBytes } from 'node:crypto'

export const MAILPIT_API = 'http://127.0.0.1:8025'

/** An address no other test uses: random, not a counter. */
export function uniqueAddress(): string {
  return `e2e-${randomBytes(8).toString('hex')}@example.test`
}

export interface Mail {
  subject: string
  from: string
  to: string[]
  /** The plain-text body with line endings turned into `\n`. */
  text: string
  html: string
  created: string
}

interface Summary {
  ID: string
  Created: string
}

async function api<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${MAILPIT_API}${path}`)
  } catch (err) {
    throw new Error(`Mailpit is not reachable at ${MAILPIT_API}: run \`make mailpit-up\` (${String(err)})`)
  }
  if (!res.ok) throw new Error(`Mailpit ${path} answered ${res.status}`)
  return (await res.json()) as T
}

/** Mailpit's version, read from its own info endpoint. */
export async function mailpitVersion(): Promise<string> {
  return (await api<{ Version: string }>('/api/v1/info')).Version
}

/** The messages Mailpit holds for one recipient, oldest first. Only mail to `address` is read. */
export async function messagesTo(address: string): Promise<Mail[]> {
  const found = await api<{ messages: Summary[] | null }>(
    `/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}&limit=100`,
  )
  // The search answers newest first; the sort is stable, so reversing first keeps ties in arrival order.
  const summaries = [...(found.messages ?? [])].reverse().sort((a, b) => a.Created.localeCompare(b.Created))
  return Promise.all(
    summaries.map(async (summary) => {
      const full = await api<{
        Subject: string
        From: { Address: string }
        To: { Address: string }[]
        Text: string
        HTML: string
      }>(`/api/v1/message/${summary.ID}`)
      return {
        subject: full.Subject,
        from: full.From.Address,
        to: full.To.map((t) => t.Address),
        text: full.Text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'),
        html: full.HTML,
        created: summary.Created,
      }
    }),
  )
}

/** Polls every 500 ms for up to 30 seconds until at least `n` messages are there. */
export async function waitForMessages(address: string, n: number): Promise<Mail[]> {
  const deadline = Date.now() + 30_000
  let found: Mail[] = []
  for (;;) {
    found = await messagesTo(address)
    if (found.length >= n) return found
    if (Date.now() >= deadline) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(
    `expected at least ${n} message(s) to ${address}, found ${found.length}: ${JSON.stringify(found.map((m) => m.subject))}`,
  )
}
