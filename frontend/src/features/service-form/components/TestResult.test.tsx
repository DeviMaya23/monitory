import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ServiceTestResult } from '../../../lib/api/services'
import type { TestState } from '../hooks/useTestCheck'
import type { ServiceType } from '../lib/serviceType'
import { TestResult } from './TestResult'

function show(result: ServiceTestResult, type: ServiceType = 'http') {
  const state: TestState = { kind: 'result', result, type }
  return render(<TestResult state={state} />)
}

describe('TestResult (FR-104, FR-61, NFR-7)', () => {
  it('shows a healthy HTTP result with status, time and the body in a focusable named box', () => {
    show({ healthy: true, duration_ms: 312, http_status: 200, response_body: 'pong body', response_body_truncated: false })
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toHaveClass('status--ok')
    expect(screen.getByText('Took').nextSibling).toHaveTextContent('312 ms')
    expect(screen.getByText('HTTP').nextSibling).toHaveTextContent('200')
    expect(screen.getByText('Response body')).toBeInTheDocument()
    expect(screen.getByText('plain text')).toBeInTheDocument()
    const box = screen.getByLabelText('Response body')
    expect(box.tagName).toBe('PRE')
    expect(box).toHaveAttribute('tabindex', '0')
    expect(box).toHaveTextContent('pong body')
  })

  it('shows the cut-off line only when the body was cut off', () => {
    const cutOff = 'Cut off: the body is longer than 64 KB. Only the first 64 KB is shown.'
    const { unmount } = show({ healthy: true, duration_ms: 1, http_status: 200, response_body: 'x', response_body_truncated: true })
    expect(screen.getByText(cutOff)).toBeInTheDocument()
    unmount()
    show({ healthy: true, duration_ms: 1, http_status: 200, response_body: 'x', response_body_truncated: false })
    expect(screen.queryByText(cutOff)).not.toBeInTheDocument()
  })

  it('shows No response body. and no box for an empty body', () => {
    show({ healthy: true, duration_ms: 1, http_status: 204, response_body: '' })
    expect(screen.getByText('No response body.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Response body')).not.toBeInTheDocument()
  })

  it('words a failed non-2xx result by the dashboard text and says the body is not rendered', () => {
    show({
      healthy: false,
      duration_ms: 1204,
      http_status: 503,
      response_body: 'service gone',
      failure_reason: { code: 'non_2xx_status', http_status: 503 },
    })
    expect(screen.getByText('Failed')).toHaveClass('status--bad')
    expect(screen.getByText('Returned HTTP 503 (expected 2xx)')).toBeInTheDocument()
    expect(screen.getByText('1,204 ms')).toBeInTheDocument()
    expect(screen.getByText('HTTP').nextSibling).toHaveTextContent('503')
    expect(screen.getByText('plain text, not rendered')).toBeInTheDocument()
    expect(screen.getByLabelText('Response body')).toHaveTextContent('service gone')
  })

  it('words a matched JSON rule and a failure with no reason', () => {
    const { unmount } = show({
      healthy: false,
      duration_ms: 5,
      http_status: 200,
      response_body: '{}',
      failure_reason: { code: 'json_rule_matched', json_rule_field: 'checks.db.status' },
    })
    expect(screen.getByText('JSON rule matched: checks.db.status')).toBeInTheDocument()
    unmount()
    show({ healthy: false, duration_ms: 5 })
    expect(screen.getByText('Check failed')).toBeInTheDocument()
  })

  it('shows a timeout with no status as such: no HTTP entry and no body box', () => {
    show({ healthy: false, duration_ms: 10000, failure_reason: { code: 'timed_out' } })
    expect(screen.getByText('Timed out')).toBeInTheDocument()
    expect(screen.getByText('10,000 ms')).toBeInTheDocument()
    expect(screen.getByText('No response was received, so there is no status code or body.')).toBeInTheDocument()
    expect(screen.queryByText('HTTP')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Response body')).not.toBeInTheDocument()
  })

  it.each([
    ['healthy', { healthy: true, duration_ms: 5 }],
    ['failed', { healthy: false, duration_ms: 5, failure_reason: { code: 'could_not_connect' } }],
  ] as const)('shows a %s TCP result with the TCP line only', (_name, result) => {
    show(result, 'tcp')
    expect(screen.getByText('TCP checks have no status code or body.')).toBeInTheDocument()
    expect(screen.queryByText('HTTP')).not.toBeInTheDocument()
    expect(screen.queryByText('Response body')).not.toBeInTheDocument()
  })

  it('shows markup in the body and in a failure field as literal text', () => {
    const { container } = show({
      healthy: false,
      duration_ms: 5,
      http_status: 200,
      response_body: '<b>x</b><script>alert(1)</script>',
      failure_reason: { code: 'json_rule_matched', json_rule_field: '<i>y</i>' },
    })
    expect(screen.getByLabelText('Response body')).toHaveTextContent('<b>x</b><script>alert(1)</script>')
    expect(screen.getByText('JSON rule matched: <i>y</i>')).toBeInTheDocument()
    expect(container.querySelector('b, i, script')).toBeNull()
  })

  it('shows nothing while idle', () => {
    const { container } = render(<TestResult state={{ kind: 'idle' }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
