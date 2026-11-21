import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { ServiceFormValues } from '../hooks/useCreateService'
import { HttpsGroup } from './HttpsGroup'

type Errors = Partial<Record<string, string>>

function setup({
  url = '',
  saving = false,
  errors = {},
  daysError = null,
}: { url?: string; saving?: boolean; errors?: Errors; daysError?: string | null } = {}) {
  const serverErrors = {
    errorFor: vi.fn((target: string) => errors[target] ?? null),
    bareError: vi.fn((path: string) => errors[path] ?? null),
    clearField: vi.fn(),
    clearBare: vi.fn(),
    clearExpiryOff: vi.fn(),
  }
  const clearDaysError = vi.fn()
  function Harness() {
    const { control, register } = useForm<ServiceFormValues>({
      defaultValues: { url, cert_enabled: false, cert_days: '14', ignore_cert_errors: false },
    })
    return (
      <>
        <input aria-label="URL" {...register('url')} />
        <HttpsGroup
          control={control}
          register={register}
          saving={saving}
          daysError={daysError}
          clearDaysError={clearDaysError}
          serverErrors={serverErrors as unknown as Parameters<typeof HttpsGroup>[0]['serverErrors']}
        />
      </>
    )
  }
  render(<Harness />)
  return { user: userEvent.setup(), serverErrors, clearDaysError }
}

const expiry = () => screen.getByRole('switch', { name: 'Check certificate expiry' })
const ignore = () => screen.getByRole('switch', { name: 'Ignore certificate errors' })
const days = () => screen.getByLabelText('Minimum days left')
const NOTE = 'Available only when the URL starts with https://.'

describe('HttpsGroup', () => {
  it('with no URL shows the note, both switches off and disabled, and the days at 14 and disabled (FR-74)', () => {
    setup()
    expect(document.querySelector('legend')).toHaveTextContent('HTTPS')
    expect(screen.getByText(NOTE)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'HTTPS' })).toHaveAccessibleDescription(NOTE)
    expect(expiry()).toHaveAttribute('aria-checked', 'false')
    expect(expiry()).toHaveAttribute('aria-disabled', 'true')
    expect(ignore()).toHaveAttribute('aria-checked', 'false')
    expect(ignore()).toHaveAttribute('aria-disabled', 'true')
    expect(days()).toHaveValue('14')
    expect(days()).toBeDisabled()
    expect(expiry()).toHaveAccessibleDescription('Mark unhealthy when the certificate expires within the minimum days.')
    expect(ignore()).toHaveAccessibleDescription('Accept invalid or self-signed certificates.')
  })

  it.each(['https://x.example.com', 'HTTPS://x', ' https://x'])(
    'with the URL %j has no note and enables the switches',
    (url) => {
      setup({ url })
      expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'HTTPS' })).not.toHaveAttribute('aria-describedby')
      expect(expiry()).not.toHaveAttribute('aria-disabled', 'true')
      expect(ignore()).not.toHaveAttribute('aria-disabled', 'true')
      expect(days()).toBeDisabled()
    },
  )

  it.each(['http://x.example.com', 'https:/x', 'xhttps://x'])(
    'with the URL %j shows the note and disables everything',
    (url) => {
      setup({ url })
      expect(screen.getByText(NOTE)).toBeInTheDocument()
      expect(expiry()).toHaveAttribute('aria-disabled', 'true')
      expect(ignore()).toHaveAttribute('aria-disabled', 'true')
      expect(days()).toBeDisabled()
    },
  )

  it('turning the expiry switch on enables the days; turning it off disables them and keeps their text (FR-34, FR-50)', async () => {
    const { user, serverErrors, clearDaysError } = setup({ url: 'https://x' })
    await user.click(expiry())
    expect(days()).toBeEnabled()
    await user.clear(days())
    await user.type(days(), '30')
    await user.click(expiry())
    expect(days()).toBeDisabled()
    expect(days()).toHaveValue('30')
    expect(serverErrors.clearExpiryOff).toHaveBeenCalledTimes(1)
    expect(clearDaysError).toHaveBeenCalled()
    await user.click(expiry())
    expect(days()).toHaveValue('30')
    expect(serverErrors.clearBare).toHaveBeenCalledWith('check.certificate_check.enabled')
  })

  it('the days is a text input with a numeric keyboard and a days addon', () => {
    setup({ url: 'https://x' })
    expect(days()).toHaveAttribute('type', 'text')
    expect(days()).toHaveAttribute('inputmode', 'numeric')
    expect(days().closest('.input-group')).toHaveTextContent('days')
    expect(days().closest('.sub-switch')).not.toBeNull()
  })

  it('editing the days clears the client and server days errors; the ignore switch clears its own', async () => {
    const { user, serverErrors, clearDaysError } = setup({ url: 'https://x' })
    await user.click(expiry())
    await user.type(days(), '1')
    expect(clearDaysError).toHaveBeenCalled()
    expect(serverErrors.clearField).toHaveBeenCalledWith('check.certificate_check.min_days_left')
    await user.click(ignore())
    expect(serverErrors.clearBare).toHaveBeenCalledWith('check.ignore_certificate_errors')
  })

  it('shows the days error under the days input with aria-invalid and aria-describedby', () => {
    setup({ url: 'https://x', daysError: 'Must be 1 or more.' })
    expect(days()).toHaveAttribute('aria-invalid', 'true')
    expect(days()).toHaveAccessibleDescription('Must be 1 or more.')
  })

  it('shows the two switch errors as text under their switch, with nothing marked invalid', () => {
    setup({
      url: 'https://x',
      errors: {
        'check.certificate_check.enabled': 'Needs <i>https</i>.',
        'check.ignore_certificate_errors': 'Also needs https.',
      },
    })
    expect(screen.getByText('Needs <i>https</i>.')).toBeInTheDocument()
    expect(screen.getByText('Also needs https.')).toBeInTheDocument()
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull()
    expect(expiry().closest('div')).toContainElement(screen.getByText('Needs <i>https</i>.'))
  })

  it('locks the days and disables the switches while saving', () => {
    setup({ url: 'https://x', saving: true })
    expect(expiry()).toHaveAttribute('aria-disabled', 'true')
    expect(ignore()).toHaveAttribute('aria-disabled', 'true')
    expect(days()).toHaveAttribute('readonly')
  })
})
