import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LeaveGateProvider } from '../components/LeaveGateProvider'
import type { LeaveAsk } from './leaveGateContext'
import { useLeaveGate, useRegisterLeaveAsk } from './useLeaveGate'

function Shell({ proceed }: { proceed: () => void }) {
  const { confirmLeave } = useLeaveGate()
  return (
    <button type="button" onClick={() => confirmLeave(proceed)}>
      leave
    </button>
  )
}

function Form({ ask }: { ask: LeaveAsk }) {
  useRegisterLeaveAsk(ask)
  return <p>form</p>
}

function Page({ ask, proceed, formShown = true }: { ask: LeaveAsk; proceed: () => void; formShown?: boolean }) {
  return (
    <LeaveGateProvider>
      <Shell proceed={proceed} />
      {formShown && <Form ask={ask} />}
    </LeaveGateProvider>
  )
}

describe('confirmLeave', () => {
  it('runs proceed once, at once, when nothing is registered', async () => {
    const proceed = vi.fn()
    render(
      <LeaveGateProvider>
        <Shell proceed={proceed} />
      </LeaveGateProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'leave' }))
    expect(proceed).toHaveBeenCalledTimes(1)
  })

  it('runs proceed once when the registered ask has nothing to ask, passing it the proceed', async () => {
    const proceed = vi.fn()
    const ask = vi.fn(() => false)
    render(<Page ask={ask} proceed={proceed} />)
    await userEvent.click(screen.getByRole('button', { name: 'leave' }))
    expect(ask).toHaveBeenCalledWith(proceed)
    expect(proceed).toHaveBeenCalledTimes(1)
  })

  it('leaves proceed to the registered side when the ask takes over', async () => {
    const proceed = vi.fn()
    const ask = vi.fn(() => true)
    render(<Page ask={ask} proceed={proceed} />)
    await userEvent.click(screen.getByRole('button', { name: 'leave' }))
    expect(ask).toHaveBeenCalledWith(proceed)
    expect(proceed).not.toHaveBeenCalled()
    // The registered side answers by calling it.
    ask.mock.calls[0][0]()
    expect(proceed).toHaveBeenCalledTimes(1)
  })

  it('runs proceed at once after the registering component unmounts', async () => {
    const proceed = vi.fn()
    const ask = vi.fn(() => true)
    const { rerender } = render(<Page ask={ask} proceed={proceed} />)
    rerender(<Page ask={ask} proceed={proceed} formShown={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'leave' }))
    expect(ask).not.toHaveBeenCalled()
    expect(proceed).toHaveBeenCalledTimes(1)
  })

  it('calls the latest ask after a re-render with a different one', async () => {
    const proceed = vi.fn()
    const first = vi.fn(() => true)
    const second = vi.fn(() => true)
    const { rerender } = render(<Page ask={first} proceed={proceed} />)
    rerender(<Page ask={second} proceed={proceed} />)
    await userEvent.click(screen.getByRole('button', { name: 'leave' }))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('outside a provider', () => {
  it('confirmLeave runs proceed at once and a registration does nothing', async () => {
    const proceed = vi.fn()
    const ask = vi.fn(() => true)
    render(
      <>
        <Shell proceed={proceed} />
        <Form ask={ask} />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'leave' }))
    expect(ask).not.toHaveBeenCalled()
    expect(proceed).toHaveBeenCalledTimes(1)
  })
})
