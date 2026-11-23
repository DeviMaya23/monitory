import { ApiError } from '../../../lib/api/ApiError'

/** The answer to a row action (delete, pause, resume), by status and code (never by message text). */
export type Outcome = 'unauthenticated' | 'gone' | 'csrf' | 'failed'

export function toOutcome(error: unknown): Outcome {
  if (error instanceof ApiError) {
    if (error.status === 401 && error.code === 'unauthenticated') return 'unauthenticated'
    if (error.status === 404 && error.code === 'not_found') return 'gone'
    if (error.status === 403 && error.code === 'csrf_failed') return 'csrf'
  }
  return 'failed'
}

/** What the admin reads when the service is already gone. */
export const GONE_MESSAGE = 'That service was already deleted.'

/** The toast for the "gone" outcome. */
export function goneToast() {
  return { kind: 'error' as const, message: GONE_MESSAGE }
}
