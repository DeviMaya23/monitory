import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { ServiceFormValues } from '../hooks/useCreateService'
import { TIMING_DEFAULTS, type TimingName } from '../lib/timingGroup'
import { TimingGroup } from './TimingGroup'

type Extra = {
  saving?: boolean
  groupError?: string | null
  errors?: Partial<Record<TimingName, string>>
}

function Harness({
  saving = false,
  groupError = null,
  errors = {},
  onEdit,
}: Extra & { onEdit: (n: TimingName) => void }) {
  const { control, register } = useForm<ServiceFormValues>({
    defaultValues: { ...TIMING_DEFAULTS } as ServiceFormValues,
  })
  const all = {
    check_interval: null,
    timeout: null,
    retries: null,
    retry_interval: null,
    ...errors,
  }
  return (
    <TimingGroup
      control={control}
      register={register}
      saving={saving}
      errors={all}
      groupError={groupError}
      onEdit={onEdit}
    />
  )
}

describe('TimingGroup', () => {
  it('reports which input was edited', async () => {
    const onEdit = vi.fn()
    render(<Harness onEdit={onEdit} />)
    await userEvent.type(screen.getByLabelText('Retries'), '1')
    expect(onEdit).toHaveBeenCalledWith('retries')
  })

  it('shows the line from the values and writes the longest attempt with the timeout alone for zero retries', async () => {
    render(<Harness onEdit={vi.fn()} />)
    await userEvent.clear(screen.getByLabelText('Retries'))
    await userEvent.type(screen.getByLabelText('Retries'), '0')
    expect(document.querySelector('.timing-sum')).toHaveTextContent(
      '10 × (1 + 0) + 10 × 0 = 10 s fits in the 60 s interval.',
    )
  })

  it('shows the group error and the field errors it is given, with the group marked', () => {
    render(<Harness onEdit={vi.fn()} groupError="Too long." errors={{ timeout: 'Out of range.' }} />)
    expect(screen.getByText('Too long.')).toBeInTheDocument()
    expect(screen.getByLabelText('Timeout')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Retries')).not.toHaveAttribute('aria-invalid')
    expect(document.querySelector('fieldset')).toHaveClass('group--invalid')
  })

  it('locks the inputs while saving', () => {
    render(<Harness onEdit={vi.fn()} saving />)
    expect(screen.getByLabelText('Timeout')).toHaveAttribute('readonly')
  })
})
