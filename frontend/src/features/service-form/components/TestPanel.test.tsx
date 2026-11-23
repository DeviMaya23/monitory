import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TestState } from '../hooks/useTestCheck'
import { TestPanel } from './TestPanel'

const panel = (state: TestState, saving = false, onRun = vi.fn()) => {
  render(<TestPanel state={state} saving={saving} onRun={onRun} />)
  return onRun
}

describe('TestPanel', () => {
  it('idle shows the title, the hint and Run test, with an empty polite result area', () => {
    panel({ kind: 'idle' })
    expect(screen.getByRole('complementary', { name: 'Test check' })).toBeInTheDocument()
    expect(screen.getByText('Runs one attempt with the values in the form. Nothing is saved.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run test' })).toBeEnabled()
    const area = document.querySelector('[aria-live="polite"]')
    expect(area).toBeEmptyDOMElement()
  })

  it('running shows Testing… busy and disabled, with the status notice', () => {
    panel({ kind: 'running' })
    const button = screen.getByRole('button', { name: 'Testing…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Running one attempt…')
  })

  it('is disabled while a save is in flight, not busy', () => {
    panel({ kind: 'idle' }, true)
    const button = screen.getByRole('button', { name: 'Run test' })
    expect(button).toBeDisabled()
    expect(button).not.toHaveAttribute('aria-busy')
  })

  it('calls onRun on a click and shows the failed kinds as alerts, Reload only for csrf', () => {
    const onRun = panel({ kind: 'failed', reason: 'csrf' })
    screen.getByRole('button', { name: 'Run test' }).click()
    expect(onRun).toHaveBeenCalledTimes(1)
    expect(within(screen.getByRole('alert')).getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })
})
