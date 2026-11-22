import { describe, expect, it } from 'vitest'
import { formatDuration, resultView } from './testResult'

describe('formatDuration', () => {
  it.each([
    [0, '0 ms'],
    [312, '312 ms'],
    [1204, '1,204 ms'],
    [10000, '10,000 ms'],
  ])('%i is %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text)
  })
})

describe('resultView (FR-104, FR-61)', () => {
  it('shows a healthy HTTP answer with its body and the cut-off flag', () => {
    expect(
      resultView({ healthy: true, duration_ms: 312, http_status: 200, response_body: 'ok', response_body_truncated: true }, 'http'),
    ).toEqual({
      healthy: true,
      reason: null,
      took: '312 ms',
      httpStatus: 200,
      detail: { kind: 'body', label: 'plain text', body: 'ok', truncated: true },
    })
  })

  it('treats an empty or missing body of a response as no body', () => {
    expect(resultView({ healthy: true, duration_ms: 1, http_status: 204, response_body: '' }, 'http').detail).toEqual({
      kind: 'no-body',
      label: 'plain text',
    })
    expect(resultView({ healthy: true, duration_ms: 1, http_status: 204 }, 'http').detail.kind).toBe('no-body')
  })

  it('words a failure by the dashboard text and says the body is not rendered', () => {
    const view = resultView(
      {
        healthy: false,
        duration_ms: 1204,
        http_status: 503,
        response_body: 'down',
        failure_reason: { code: 'non_2xx_status', http_status: 503 },
      },
      'http',
    )
    expect(view.reason).toBe('Returned HTTP 503 (expected 2xx)')
    expect(view.detail).toMatchObject({ label: 'plain text, not rendered', truncated: false })
  })

  it('says Check failed when a failed result has no reason', () => {
    expect(resultView({ healthy: false, duration_ms: 1 }, 'http').reason).toBe('Check failed')
  })

  it('has no response when no status arrived', () => {
    expect(resultView({ healthy: false, duration_ms: 10000, failure_reason: { code: 'timed_out' } }, 'http').detail).toEqual({
      kind: 'no-response',
    })
  })

  it('goes by the type that was sent: a TCP result has no status or body even if the result carries them', () => {
    const view = resultView({ healthy: true, duration_ms: 5, http_status: 200, response_body: 'x' }, 'tcp')
    expect(view.detail).toEqual({ kind: 'tcp' })
    expect(view.httpStatus).toBeNull()
  })
})
