import type { ServiceTestResult } from '../../../lib/api/services'
import { failureReasonText } from '../../../lib/failureReason'
import type { ServiceType } from './serviceType'
import { RELOAD_LABEL, REQUEST_NOT_ACCEPTED_TEXT, REQUEST_NOT_ACCEPTED_TITLE } from '../../../lib/requestNotAccepted'

/** The words of the test panel. Each string is defined here once. */
export const TEST_TEXT = {
  title: 'Test check',
  hint: 'Runs one attempt with the values in the form. Nothing is saved.',
  run: 'Run test',
  running: 'Testing…',
  runningNotice: 'Running one attempt…',
  healthy: 'Healthy',
  failed: 'Failed',
  noReason: 'Check failed',
  took: 'Took',
  http: 'HTTP',
  bodyLabel: 'Response body',
  plain: 'plain text',
  plainFailed: 'plain text, not rendered',
  noBody: 'No response body.',
  truncated: 'Cut off: the body is longer than 64 KB. Only the first 64 KB is shown.',
  noResponse: 'No response was received, so there is no status code or body.',
  tcp: 'TCP checks have no status code or body.',
  notRun: 'Test not run. Fix the highlighted fields first.',
  csrf: `${REQUEST_NOT_ACCEPTED_TITLE} ${REQUEST_NOT_ACCEPTED_TEXT}`,
  reload: RELOAD_LABEL,
  tooLarge: 'The test is too large to send. Shorten the body or the header values.',
  unexpected: 'The test couldn’t be run. The server couldn’t be reached or returned an error.',
} as const

const THOUSANDS = new Intl.NumberFormat('en-US')

/** A duration as `{n} ms` with thousands separators. */
export function formatDuration(ms: number): string {
  return `${THOUSANDS.format(ms)} ms`
}

/** What the result area shows after a completed test. The type is the one that was sent. */
export type ResultView = {
  healthy: boolean
  /** The failure text of a failed result, else null. */
  reason: string | null
  took: string
  httpStatus: number | null
  detail:
    | { kind: 'tcp' }
    | { kind: 'no-response' }
    | { kind: 'body'; label: string; body: string; truncated: boolean }
    | { kind: 'no-body'; label: string }
}

export function resultView(result: ServiceTestResult, type: ServiceType): ResultView {
  const httpStatus = type === 'tcp' ? null : (result.http_status ?? null)
  const reason = result.healthy
    ? null
    : result.failure_reason
      ? failureReasonText(result.failure_reason)
      : TEST_TEXT.noReason
  const base = { healthy: result.healthy, reason, took: formatDuration(result.duration_ms), httpStatus }
  if (type === 'tcp') return { ...base, detail: { kind: 'tcp' } }
  if (httpStatus === null) return { ...base, detail: { kind: 'no-response' } }
  const label = result.healthy ? TEST_TEXT.plain : TEST_TEXT.plainFailed
  const body = result.response_body ?? ''
  return {
    ...base,
    detail:
      body === ''
        ? { kind: 'no-body', label }
        : { kind: 'body', label, body, truncated: result.response_body_truncated === true },
  }
}
