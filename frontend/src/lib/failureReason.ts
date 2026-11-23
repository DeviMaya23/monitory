import type { FailureReason } from './api/services'

/** The text shown for a failed check (FR-61). The only place this wording lives. */
export function failureReasonText(reason: FailureReason): string {
  switch (reason.code) {
    case 'timed_out':
      return 'Timed out'
    case 'could_not_connect':
      return 'Could not connect'
    case 'non_2xx_status':
      return reason.http_status == null
        ? 'Returned an HTTP error (expected 2xx)'
        : `Returned HTTP ${reason.http_status} (expected 2xx)`
    case 'json_rule_matched':
      return reason.json_rule_field == null ? 'JSON rule matched' : `JSON rule matched: ${reason.json_rule_field}`
    case 'invalid_or_missing_json':
      return 'Response is not valid JSON, or the JSON is missing'
    case 'too_many_redirects':
      return 'Too many redirects'
    case 'certificate_problem':
      return 'Certificate problem'
    default:
      return 'Check failed'
  }
}
