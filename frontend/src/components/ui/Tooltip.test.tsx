import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Link } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Tooltip } from './Tooltip'

function setup(content = 'Full name') {
  return render(
    <MemoryRouter>
      <Tooltip content={content}>
        <Link to="/x">Short</Link>
      </Tooltip>
      <button type="button">After</button>
    </MemoryRouter>,
  )
}

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens on hover, is the trigger’s description, and closes on leave', async () => {
    setup()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const link = screen.getByRole('link', { name: 'Short' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await user.hover(link)
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('Full name')
    expect(link).toHaveAttribute('aria-describedby', tip.id)
    await user.unhover(link)
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('opens on keyboard focus, and closes on blur and on Esc', async () => {
    setup()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.tab()
    expect(screen.getByRole('link', { name: 'Short' })).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Full name')
    await user.tab()
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await user.tab({ shift: true })
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders the content as text', async () => {
    const { container } = setup('<b>x</b>')
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('<b>x</b>')
    expect(document.querySelector('[role="tooltip"] b')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
  })

  it('makes the child the trigger itself, with no wrapper, and renders the popup in the portal host', async () => {
    const { container } = setup()
    const link = screen.getByRole('link', { name: 'Short' })
    expect(link.parentElement).toBe(container)
    expect(container.querySelectorAll('a')).toHaveLength(1)
    fireEvent.focus(link)
    const tip = await screen.findByRole('tooltip')
    expect(tip.closest('[data-portal-host]')).not.toBeNull()
    expect(container).not.toContainElement(tip)
  })
})
