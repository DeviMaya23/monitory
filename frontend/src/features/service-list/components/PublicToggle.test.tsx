import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PublicViewFlow, PublicViewState } from '../hooks/usePublicView'
import { PublicToggle } from './PublicToggle'

function renderToggle(state: PublicViewState, toggle = vi.fn<(next: boolean) => void>()) {
  const flow: PublicViewFlow = { state, refresh: () => {}, toggle }
  render(<PublicToggle publicView={flow} />)
  return toggle
}

const openLink = () => screen.getByRole('link', { name: 'Open public page (new tab)' })

describe.each<PublicViewState>(['loading', 'not-loaded'])('while the setting is %s', (state) => {
  it('has a disabled, unchecked switch with no On or Off word, and a working Open link (FR-26)', () => {
    const toggle = renderToggle(state)
    const control = screen.getByRole('switch', { name: 'Public page' })
    expect(control).toHaveAttribute('aria-disabled', 'true')
    expect(control).not.toBeChecked()
    expect(screen.queryByText('On')).not.toBeInTheDocument()
    expect(screen.queryByText('Off')).not.toBeInTheDocument()
    expect(openLink()).toHaveAttribute('href', '/status')
    expect(toggle).not.toHaveBeenCalled()
  })
})

describe.each<[PublicViewState, boolean, string]>([
  ['on', true, 'On'],
  ['off', false, 'Off'],
])('when the setting is %s', (state, checked, word) => {
  it('shows an enabled switch with its word, and the same Open link (FR-26, FR-28)', () => {
    renderToggle(state)
    const control = screen.getByRole('switch', { name: 'Public page' })
    expect(control).not.toHaveAttribute('aria-disabled', 'true')
    expect(control.getAttribute('aria-checked')).toBe(String(checked))
    expect(screen.getByText(word)).toBeInTheDocument()
    const link = openLink()
    expect(link).toHaveAttribute('href', '/status')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  it('asks for the opposite value, with a click and with Space (NFR-4)', async () => {
    const toggle = renderToggle(state)
    const user = userEvent.setup()
    await user.tab()
    expect(screen.getByRole('switch')).toHaveFocus()
    await user.keyboard(' ')
    expect(toggle).toHaveBeenLastCalledWith(!checked)
    await user.click(screen.getByRole('switch'))
    expect(toggle).toHaveBeenCalledTimes(2)
  })
})
