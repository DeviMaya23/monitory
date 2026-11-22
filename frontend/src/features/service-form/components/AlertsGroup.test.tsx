import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { ServiceFormValues } from '../lib/formValues'
import { AlertsGroup } from './AlertsGroup'

type Props = { saving?: boolean; unhealthyError?: string | null; clearField?: () => void }

/** The group over a real form, since the counters and the switch read the form's values. */
function Harness({ saving = false, unhealthyError = null, clearField = () => {} }: Props) {
  const { control, register } = useForm<ServiceFormValues>({
    defaultValues: {
      name: '',
      method: 'GET',
      url: '',
      alerts_enabled: true,
      unhealthy_message: '',
      recovery_message: '',
    },
  })
  return (
    <AlertsGroup
      control={control}
      register={register}
      saving={saving}
      unhealthyError={unhealthyError}
      recoveryError={null}
      clearField={clearField}
    />
  )
}

const unhealthyArea = () => screen.getByLabelText('Unhealthy message (optional)')
const counters = () => Array.from(document.querySelectorAll('.counter')).map((counter) => counter.textContent)

describe('AlertsGroup', () => {
  it('counts code points, so an emoji is one and a long paste is kept and counted past 500', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(unhealthyArea(), '😀😀')
    expect(counters()).toEqual(['2/500', '0/500'])
    await user.clear(unhealthyArea())
    await user.click(unhealthyArea())
    await user.paste('a'.repeat(503))
    expect(unhealthyArea()).toHaveValue('a'.repeat(503))
    expect(counters()[0]).toBe('503/500')
  })

  it('tells the server error to go when its text area is edited, and the other one not', async () => {
    const user = userEvent.setup()
    const clearField = vi.fn()
    render(<Harness clearField={clearField} />)
    await user.type(unhealthyArea(), 'x')
    expect(clearField).toHaveBeenCalledWith('unhealthy_message')
    expect(clearField).not.toHaveBeenCalledWith('recovery_message')
  })

  it('links a field error to its text area and shows it as text', () => {
    render(<Harness unhealthyError="<b>too long</b>" />)
    expect(unhealthyArea()).toHaveAttribute('aria-invalid', 'true')
    expect(unhealthyArea()).toHaveAccessibleDescription('<b>too long</b>')
    expect(document.querySelector('.error-text b')).toBeNull()
  })

  it('locks the text areas while saving', () => {
    render(<Harness saving />)
    expect(unhealthyArea()).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Recovery message (optional)')).toHaveAttribute('readonly')
    expect(screen.getByRole('switch', { name: 'Send alerts' })).toHaveAttribute('aria-disabled', 'true')
  })
})
