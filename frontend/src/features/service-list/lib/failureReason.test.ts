import { describe, expect, it } from 'vitest'
import type { FailureReason } from '../../../lib/api/services'
import { failureReasonText } from './failureReason'

describe('failureReasonText (FR-61)', () => {
  it.each<[FailureReason, string]>([
    [{ code: 'timed_out' }, 'Timed out'],
    [{ code: 'could_not_connect' }, 'Could not connect'],
    [{ code: 'non_2xx_status', http_status: 503 }, 'Returned HTTP 503 (expected 2xx)'],
    [{ code: 'json_rule_matched', json_rule_field: 'checks.db.status' }, 'JSON rule matched: checks.db.status'],
    [{ code: 'invalid_or_missing_json' }, 'Response is not valid JSON, or the JSON is missing'],
    [{ code: 'too_many_redirects' }, 'Too many redirects'],
    [{ code: 'certificate_problem' }, 'Certificate problem'],
  ])('%j gives its text', (reason, text) => {
    expect(failureReasonText(reason)).toBe(text)
  })

  it('non_2xx_status without a status code gives the fallback', () => {
    expect(failureReasonText({ code: 'non_2xx_status', http_status: null })).toBe(
      'Returned an HTTP error (expected 2xx)',
    )
  })

  it('json_rule_matched without a field gives the fallback', () => {
    expect(failureReasonText({ code: 'json_rule_matched', json_rule_field: null })).toBe('JSON rule matched')
  })

  it('an unknown code gives Check failed', () => {
    const unknown = { code: 'brand_new' } as unknown as FailureReason
    expect(failureReasonText(unknown)).toBe('Check failed')
  })
})
