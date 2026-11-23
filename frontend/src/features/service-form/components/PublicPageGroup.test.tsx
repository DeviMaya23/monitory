import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm, useWatch } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import type { ServiceFormValues } from '../lib/formValues'
import { PublicPageGroup } from './PublicPageGroup'

/** The group over a real form, since the switch reads and writes the form's value. */
function Harness({ saving = false, shown = false }: { saving?: boolean; shown?: boolean }) {
  const { control } = useForm<ServiceFormValues>({
    defaultValues: { name: '', method: 'GET', url: '', shown_on_public_view: shown },
  })
  const value = useWatch({ control, name: 'shown_on_public_view' })
  return (
    <>
      <PublicPageGroup control={control} saving={saving} />
      <output>{String(value)}</output>
    </>
  )
}

const toggle = () => screen.getByRole('switch', { name: 'Show on public page' })

describe('PublicPageGroup (FR-27, FR-68)', () => {
  it('shows the legend, the switch and its description', () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: 'Public page' })).toBeInTheDocument()
    expect(toggle()).toHaveAccessibleDescription(
      'Anyone can see its name, status and last check time. Hidden while paused.',
    )
  })

  it.each([true, false])('follows the form’s value %s and toggles it', async (shown) => {
    const user = userEvent.setup()
    render(<Harness shown={shown} />)
    expect(toggle()).toHaveAttribute('aria-checked', String(shown))
    await user.click(toggle())
    expect(toggle()).toHaveAttribute('aria-checked', String(!shown))
    expect(screen.getByRole('status')).toHaveTextContent(String(!shown))
  })

  it('is disabled while saving', async () => {
    const user = userEvent.setup()
    render(<Harness saving />)
    expect(toggle()).toHaveAttribute('aria-disabled', 'true')
    await user.click(toggle())
    expect(toggle()).toHaveAttribute('aria-checked', 'false')
  })
})
