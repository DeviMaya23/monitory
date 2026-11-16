import { ApiError, type ProblemBody } from '../lib/api/ApiError'
import type { SessionInfo } from '../lib/api/session'

export const sessionInfo: SessionInfo = { csrf_token: 'csrf-1', expires_at: '2026-12-16T10:00:00Z' }

/** An `ApiError` as `apiRequest` throws it for a problem response. */
export function problem(status: number, code: ProblemBody['code'], detail?: string): ApiError {
  return new ApiError(status, { title: 'Problem', status, code, detail }, null)
}
