import { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Select } from './Select'

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
]

type HarnessProps = {
  onValueChange?: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
}

function Harness({ onValueChange = vi.fn(), disabled, invalid, describedBy }: HarnessProps) {
  const [value, setValue] = useState('a')
  return (
    <Select
      id="greek"
      label="Letter"
      value={value}
      onValueChange={(next) => {
        onValueChange(next)
        setValue(next)
      }}
      options={OPTIONS}
      disabled={disabled}
      invalid={invalid}
      aria-describedby={describedBy}
    />
  )
}

const trigger = () => screen.getByRole('combobox', { name: 'Letter' })
const optionNames = () => within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)

describe('Select', () => {
  it('is named by its visible label and shows the current option’s label', () => {
    render(<Harness />)
    expect(trigger()).toHaveTextContent('Alpha')
    expect(trigger()).toHaveAttribute('id', 'greek')
    expect(screen.getByText('Letter').tagName).toBe('LABEL')
  })

  it('lists every option when opened, and picking one calls onValueChange with its value', async () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)
    await userEvent.click(trigger())
    expect(optionNames()).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(screen.getByRole('option', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(screen.getByRole('option', { name: 'Gamma' }))
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('c')
    await waitFor(() => expect(trigger()).toHaveTextContent('Gamma'))
  })

  it('picks with the arrow keys and Enter', async () => {
    const onValueChange = vi.fn()
    render(<Harness onValueChange={onValueChange} />)
    const user = userEvent.setup()
    trigger().focus()
    await user.keyboard('{ArrowDown}')
    await screen.findByRole('listbox')
    await user.keyboard('{ArrowDown}{Enter}')
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith('b'))
    expect(onValueChange).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(trigger()).toHaveTextContent('Beta'))
  })

  it('does not open while disabled', async () => {
    render(<Harness disabled />)
    expect(trigger()).toBeDisabled()
    await userEvent.click(trigger())
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('sets aria-invalid only when invalid, and passes aria-describedby on', () => {
    const { rerender } = render(<Harness />)
    expect(trigger()).not.toHaveAttribute('aria-invalid')
    expect(trigger()).not.toHaveAttribute('aria-describedby')
    rerender(<Harness invalid describedBy="letter-error" />)
    expect(trigger()).toHaveAttribute('aria-invalid', 'true')
    expect(trigger()).toHaveAttribute('aria-describedby', 'letter-error')
  })

  it('renders its list inside the app-scoped portal host, outside the page content', async () => {
    const { container } = render(<Harness />)
    await userEvent.click(trigger())

    const host = (await screen.findByRole('listbox')).closest('.app.portal-host')
    expect(host).not.toBeNull()
    expect(host?.parentElement).toBe(document.body)
    expect(container.contains(host)).toBe(false)
  })
})
