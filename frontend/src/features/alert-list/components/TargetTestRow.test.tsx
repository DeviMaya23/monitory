import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { TargetTestResult } from '../../../lib/api/targets'
import { TargetTestRow } from './TargetTestRow'

function renderRow(props: { testing?: boolean; result?: TargetTestResult | null } = {}) {
  const onSend = vi.fn()
  const buttonRef = createRef<HTMLButtonElement>()
  const view = render(<TargetTestRow testing={false} result={null} onSend={onSend} buttonRef={buttonRef} {...props} />)
  return { ...view, onSend, buttonRef }
}
const button = () => screen.getByRole('button')
const resultArea = () => document.querySelector('.test-row__result') as HTMLElement

describe('TargetTestRow', () => {
  it('idle: an enabled button with its icon, and the hint (FR-107)', async () => {
    const { onSend, buttonRef } = renderRow()
    expect(button()).toHaveAccessibleName('Send test alert')
    expect(button()).toHaveAttribute('type', 'button')
    expect(button()).not.toHaveAttribute('aria-disabled')
    expect(button().querySelector('svg')).not.toBeNull()
    expect(buttonRef.current).toBe(button())
    expect(resultArea()).toHaveTextContent(
      'Sends one alert to this target only, using the values above. Nothing is saved.',
    )
    await userEvent.click(button())
    expect(onSend).toHaveBeenCalledOnce()
  })

  it('in flight: aria-disabled and busy, reads Sending… with a spinner, ignores clicks', async () => {
    const { onSend } = renderRow({ testing: true })
    expect(button()).toHaveAttribute('aria-disabled', 'true')
    expect(button()).not.toBeDisabled()
    expect(button()).toHaveAttribute('aria-busy', 'true')
    expect(button()).toHaveTextContent('Sending…')
    expect(button().querySelector('.spinner')).not.toBeNull()
    expect(resultArea()).toHaveTextContent('Sending one test alert…')
    expect(resultArea().querySelector('.spinner')).not.toBeNull()
    await userEvent.click(button())
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows Delivered.', () => {
    renderRow({ result: { delivered: true } })
    expect(resultArea()).toHaveTextContent('Delivered.')
    expect(resultArea().querySelector('.notice--ok')).not.toBeNull()
  })

  it('shows the reason of a failed result', () => {
    renderRow({ result: { delivered: false, failure_reason: 'no SMTP account configured' } })
    expect(resultArea()).toHaveTextContent('Failed: no SMTP account configured')
    expect(resultArea().querySelector('.notice--bad')).not.toBeNull()
  })

  it.each([null, undefined])('shows Failed. alone for a failed result with reason %s', (reason) => {
    renderRow({ result: { delivered: false, failure_reason: reason } })
    expect(resultArea().textContent).toBe('Failed.')
  })

  it('shows a reason with markup as text (NFR-7)', () => {
    renderRow({ result: { delivered: false, failure_reason: '<b>x</b>' } })
    expect(resultArea()).toHaveTextContent('Failed: <b>x</b>')
    expect(resultArea().querySelector('b')).toBeNull()
    expect(resultArea().querySelector('.plain-text')).toHaveTextContent('<b>x</b>')
  })

  it('has a polite live region', () => {
    renderRow()
    expect(resultArea()).toHaveAttribute('aria-live', 'polite')
  })
})
