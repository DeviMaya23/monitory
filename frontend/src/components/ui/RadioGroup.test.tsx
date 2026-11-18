import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RadioGroup } from './RadioGroup'

const OPTIONS = [
  { value: 'email', text: 'Email', icon: <svg data-testid="mail-icon" /> },
  { value: 'webhook', text: 'Webhook', icon: <svg data-testid="hook-icon" /> },
] as const

function Harness({ onValueChange = vi.fn(), disabled = false }: { onValueChange?: (v: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState<'email' | 'webhook'>('email')
  return (
    <>
      <button>before</button>
      <RadioGroup
        label="Type"
        value={value}
        onValueChange={(next) => {
          onValueChange(next)
          setValue(next)
        }}
        options={OPTIONS}
        disabled={disabled}
      />
      <button>after</button>
    </>
  )
}

describe('RadioGroup', () => {
  it('is a radiogroup named by its label, with the chosen option checked and each text and icon shown', () => {
    render(<Harness />)
    expect(screen.getByRole('radiogroup', { name: 'Type' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Email' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Webhook' })).not.toBeChecked()
    expect(screen.getByText('Webhook')).toBeInTheDocument()
    expect(screen.getByTestId('mail-icon')).toBeInTheDocument()
    expect(screen.getByTestId('hook-icon')).toBeInTheDocument()
  })

  it('changes on a click and on an arrow key, calling onValueChange once each', async () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Webhook' }))
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenLastCalledWith('webhook')
    expect(screen.getByRole('radio', { name: 'Webhook' })).toBeChecked()
    await user.keyboard('{ArrowLeft}')
    expect(onValueChange).toHaveBeenCalledTimes(2)
    expect(onValueChange).toHaveBeenLastCalledWith('email')
    expect(screen.getByRole('radio', { name: 'Email' })).toBeChecked()
  })

  it('is entered once by Tab and left by the next Tab', async () => {
    render(<Harness />)
    const user = userEvent.setup()
    await user.tab()
    expect(screen.getByRole('button', { name: 'before' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('radio', { name: 'Email' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus()
  })

  it('blocks a click and an arrow key when disabled', async () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} disabled />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Webhook' }))
    await user.keyboard('{ArrowRight}')
    expect(onValueChange).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'Email' })).toBeChecked()
  })
})
