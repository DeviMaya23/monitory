import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './Toast'
import { useToast, type ToastInput } from './useToast'

function Trigger({ toast }: { toast: ToastInput }) {
  const { show } = useToast()
  return <button onClick={() => show(toast)}>show</button>
}

function setup(toast: ToastInput) {
  render(
    <ToastProvider>
      <Trigger toast={toast} />
    </ToastProvider>,
  )
  fireEvent.click(screen.getByText('show'))
}

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('placement', () => {
  it('renders the viewport inside the portal host, not in the page tree', () => {
    const { container } = render(
      <ToastProvider>
        <span />
      </ToastProvider>,
    )
    const viewport = document.querySelector('.toast-viewport')
    expect(viewport).not.toBeNull()
    expect(document.querySelector('[data-portal-host]')).toContainElement(viewport as HTMLElement)
    expect(container).not.toContainElement(viewport as HTMLElement)
  })
})

describe('success toast', () => {
  it('shows its message and is gone after exactly 5,000 ms, not at 4,999', async () => {
    setup({ kind: 'success', message: 'Service added' })
    expect(screen.getAllByText('Service added').length).toBeGreaterThan(0)
    await advance(4999)
    expect(screen.queryAllByText('Service added').length).toBeGreaterThan(0)
    await advance(1)
    expect(screen.queryAllByText('Service added')).toHaveLength(0)
  })
})

describe('error toast', () => {
  it('is announced through the alert node and is still there after a long time', async () => {
    setup({ kind: 'error', message: 'Couldn’t sign out. Try again.' })
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t sign out. Try again.')
    await advance(10 * 60 * 1000)
    expect(screen.getAllByText('Couldn’t sign out. Try again.').length).toBeGreaterThan(0)
  })
})

describe('dismiss and action', () => {
  it('Dismiss removes the toast', async () => {
    setup({ kind: 'error', message: 'Failed' })
    const toast = screen.getAllByRole('alertdialog', { hidden: true })[0]
    fireEvent.focus(toast)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await advance(1000)
    expect(screen.queryAllByText('Failed')).toHaveLength(0)
  })

  it('shows the action when given, calls it once, and removes the toast', async () => {
    const onClick = vi.fn()
    setup({ kind: 'error', message: 'Not accepted', action: { label: 'Reload', onClick } })
    fireEvent.focus(screen.getAllByRole('alertdialog', { hidden: true })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    await advance(1000)
    expect(screen.queryAllByText('Not accepted')).toHaveLength(0)
  })

  it('has no action button when none is given', () => {
    setup({ kind: 'error', message: 'Plain' })
    expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument()
  })
})
