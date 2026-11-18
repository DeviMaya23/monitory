import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './Switch'

describe('Switch', () => {
  it('shows its label as the name, and its state in aria-checked and in words', () => {
    const { rerender } = render(<Switch label="Public page" checked={false} onCheckedChange={() => {}} />)
    const control = screen.getByRole('switch', { name: 'Public page' })
    expect(control).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Off')).toBeInTheDocument()
    rerender(<Switch label="Public page" checked onCheckedChange={() => {}} />)
    expect(control).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('On')).toBeInTheDocument()
  })

  it('calls onCheckedChange with the new value, from the control and from the label', async () => {
    const onCheckedChange = vi.fn()
    const { rerender } = render(<Switch label="Public page" checked={false} onCheckedChange={onCheckedChange} />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onCheckedChange).toHaveBeenLastCalledWith(true)
    rerender(<Switch label="Public page" checked onCheckedChange={onCheckedChange} />)
    await userEvent.click(screen.getByText('Public page'))
    expect(onCheckedChange).toHaveBeenLastCalledWith(false)
    expect(onCheckedChange).toHaveBeenCalledTimes(2)
  })

  it('toggles from the keyboard', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch label="Public page" checked={false} onCheckedChange={onCheckedChange} />)
    const user = userEvent.setup()
    await user.tab()
    expect(screen.getByRole('switch')).toHaveFocus()
    await user.keyboard(' ')
    expect(onCheckedChange).toHaveBeenLastCalledWith(true)
  })

  it('does not call onCheckedChange when disabled', async () => {
    const onCheckedChange = vi.fn()
    render(<Switch label="Public page" checked={false} onCheckedChange={onCheckedChange} disabled />)
    await userEvent.click(screen.getByRole('switch'))
    await userEvent.click(screen.getByText('Public page'))
    expect(onCheckedChange).not.toHaveBeenCalled()
  })

  describe('with a description', () => {
    const HINT = 'Shown under the label.'

    it('names the switch by the label alone and describes it by the hint', () => {
      render(<Switch label="Public page" description={HINT} checked={false} onCheckedChange={() => {}} />)
      const control = screen.getByRole('switch', { name: 'Public page' })
      expect(screen.getByText(HINT)).toBeInTheDocument()
      expect(control).toHaveAccessibleName('Public page')
      expect(control).toHaveAccessibleDescription(HINT)
    })

    it('toggles when the hint text is clicked', async () => {
      const onCheckedChange = vi.fn()
      render(<Switch label="Public page" description={HINT} checked={false} onCheckedChange={onCheckedChange} />)
      await userEvent.click(screen.getByText(HINT))
      expect(onCheckedChange).toHaveBeenLastCalledWith(true)
    })

    it('renders no hint and no description without the prop', () => {
      render(<Switch label="Public page" checked={false} onCheckedChange={() => {}} />)
      expect(document.querySelector('.hint')).toBeNull()
      expect(screen.getByRole('switch')).not.toHaveAttribute('aria-describedby')
    })
  })
})
