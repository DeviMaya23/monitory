import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { ServiceFormValues } from '../hooks/useCreateService'
import { TypeField } from './TypeField'

function Harness({ saving = false, onChange = vi.fn() }: { saving?: boolean; onChange?: (next: string) => void }) {
  const { control } = useForm<ServiceFormValues>({ defaultValues: { type: 'http' } })
  return <TypeField control={control} saving={saving} onChange={onChange} />
}

describe('TypeField', () => {
  it('offers HTTP(S) chosen and TCP port, with the hint', () => {
    render(<Harness />)
    expect(screen.getByRole('radiogroup', { name: 'Type' })).toHaveAttribute('id', 'service-type')
    expect(screen.getByRole('radio', { name: 'HTTP(S)' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'TCP port' })).not.toBeChecked()
    expect(screen.getByText('Changing type swaps the fields below.')).toBeInTheDocument()
  })

  it('reports the new type once and keeps focus on the chosen radio', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'TCP port' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith('tcp')
    expect(screen.getByRole('radio', { name: 'TCP port' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'TCP port' })).toHaveFocus()
  })

  it('is locked while saving', async () => {
    const onChange = vi.fn()
    render(<Harness saving onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'TCP port' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('radio', { name: 'TCP port' })).toHaveAttribute('aria-disabled', 'true')
  })
})
