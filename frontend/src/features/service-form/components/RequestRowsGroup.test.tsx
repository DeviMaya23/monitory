import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { ServiceFormValues } from '../hooks/useCreateService'
import { RequestRowsGroup } from './RequestRowsGroup'

type Errors = Partial<Record<string, string>>

function setup({ saving = false, errors = {} }: { saving?: boolean; errors?: Errors } = {}) {
  const serverErrors = {
    errorFor: vi.fn((target: string) => errors[target] ?? null),
    bareError: vi.fn((path: string) => errors[path] ?? null),
    clearField: vi.fn(),
    clearList: vi.fn(),
    clearRows: vi.fn(),
    clearBodyType: vi.fn(),
  }
  function Harness() {
    const { control, register } = useForm<ServiceFormValues>({
      defaultValues: {
        query_params: [],
        headers: [],
        body_type: 'none',
        body_content: '',
      },
    })
    return (
      <RequestRowsGroup
        control={control}
        register={register}
        saving={saving}
        serverErrors={serverErrors as unknown as Parameters<typeof RequestRowsGroup>[0]['serverErrors']}
      />
    )
  }
  render(<Harness />)
  return { user: userEvent.setup(), serverErrors }
}

describe('RequestRowsGroup', () => {
  it('shows both lists empty with their words, the hint on headers only, and Body type on None with no Body text', () => {
    setup()
    expect(screen.getByRole('group', { name: 'Query parameters' })).toBeInTheDocument()
    expect(screen.getByText('No query parameters.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add parameter' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Headers' })).toHaveAccessibleDescription('Values are shown in full.')
    expect(screen.getByRole('group', { name: 'Query parameters' })).not.toHaveAttribute('aria-describedby')
    expect(screen.getByText('No headers.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add header' })).toBeInTheDocument()
    const body = screen.getByRole('radiogroup', { name: 'Body type' })
    expect(body).toHaveAttribute('id', 'service-body-type')
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual([
      'None',
      'JSON',
      'Plain text',
      'Form (URL-encoded)',
    ])
    expect(screen.getByRole('radio', { name: 'None' })).toBeChecked()
    expect(screen.queryByLabelText('Body')).not.toBeInTheDocument()
  })

  it('adds a row to either list with focus on its Name, and clears that list’s own error', async () => {
    const { user, serverErrors } = setup()
    await user.click(screen.getByRole('button', { name: 'Add parameter' }))
    expect(screen.getByLabelText('Query parameter 1 name')).toHaveFocus()
    expect(screen.getByLabelText('Query parameter 1 value')).toBeInTheDocument()
    expect(serverErrors.clearList).toHaveBeenLastCalledWith('query_params')
    await user.click(screen.getByRole('button', { name: 'Add header' }))
    expect(screen.getByLabelText('Header 1 name')).toHaveFocus()
    expect(serverErrors.clearList).toHaveBeenLastCalledWith('headers')
  })

  it('removes with focus on the next row’s Name, the previous row’s when the last went, and Add when none is left', async () => {
    const { user, serverErrors } = setup()
    const add = screen.getByRole('button', { name: 'Add header' })
    for (let i = 0; i < 3; i++) await user.click(add)
    await user.type(screen.getByLabelText('Header 1 name'), 'one')
    await user.type(screen.getByLabelText('Header 2 name'), 'two')
    await user.type(screen.getByLabelText('Header 3 name'), 'three')
    await user.click(screen.getByRole('button', { name: 'Remove header 2' }))
    expect(screen.getByLabelText('Header 2 name')).toHaveFocus()
    expect(screen.getByLabelText('Header 2 name')).toHaveValue('three')
    expect(serverErrors.clearRows).toHaveBeenLastCalledWith('headers')
    await user.click(screen.getByRole('button', { name: 'Remove header 2' }))
    expect(screen.getByLabelText('Header 1 name')).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Remove header 1' }))
    expect(add).toHaveFocus()
  })

  it('has no limit on the number of rows', async () => {
    const { user } = setup()
    for (let i = 0; i < 21; i++) await user.click(screen.getByRole('button', { name: 'Add parameter' }))
    expect(screen.getByLabelText('Query parameter 21 name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add parameter' })).toBeEnabled()
  })

  it('clears a row’s error when its input is edited', async () => {
    const { user, serverErrors } = setup()
    await user.click(screen.getByRole('button', { name: 'Add parameter' }))
    await user.type(screen.getByLabelText('Query parameter 1 value'), 'x')
    expect(serverErrors.clearField).toHaveBeenCalledWith('check.query_params[0].value')
  })

  it.each([
    ['JSON', 'json'],
    ['Plain text', 'text'],
    ['Form (URL-encoded)', 'form'],
  ])('shows the Body text with its hint for %s, and hides it for None, keeping the text', async (text) => {
    const { user, serverErrors } = setup()
    await user.click(screen.getByRole('radio', { name: text }))
    const area = screen.getByLabelText('Body')
    expect(area.tagName).toBe('TEXTAREA')
    expect(area).toHaveAttribute('id', 'service-body-content')
    expect(area).toHaveAttribute('rows', '6')
    expect(area).not.toHaveAttribute('maxlength')
    expect(area).not.toHaveAttribute('placeholder')
    expect(area).toHaveAccessibleDescription('Sent as entered.')
    expect(serverErrors.clearBodyType).toHaveBeenCalled()
    await user.type(area, 'kept text')
    await user.click(screen.getByRole('radio', { name: 'None' }))
    expect(screen.queryByLabelText('Body')).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: text }))
    expect(screen.getByLabelText('Body')).toHaveValue('kept text')
  })

  it('clears the body’s error when its text is typed in', async () => {
    const { user, serverErrors } = setup()
    await user.click(screen.getByRole('radio', { name: 'JSON' }))
    await user.type(screen.getByLabelText('Body'), 'a')
    expect(serverErrors.clearField).toHaveBeenCalledWith('check.body.content')
  })

  it('shows the body’s error under the text, replacing the hint, with aria-invalid and aria-describedby', async () => {
    const { user } = setup({ errors: { 'check.body.content': '<b>Too long.</b>' } })
    await user.click(screen.getByRole('radio', { name: 'JSON' }))
    const area = screen.getByLabelText('Body')
    expect(area).toHaveAttribute('aria-invalid', 'true')
    expect(area).toHaveAccessibleDescription('<b>Too long.</b>')
    expect(screen.queryByText('Sent as entered.')).not.toBeInTheDocument()
    expect(document.querySelector('b')).toBeNull()
  })

  it('shows a list error under its rows and a row error under its input', async () => {
    const { user } = setup({
      errors: { 'check.headers': 'Too many headers.', 'check.headers[0].value': 'Value too long.' },
    })
    await user.click(screen.getByRole('button', { name: 'Add header' }))
    expect(screen.getByText('Too many headers.')).toBeInTheDocument()
    expect(screen.getByLabelText('Header 1 value')).toHaveAccessibleDescription('Value too long.')
    expect(screen.getByLabelText('Header 1 name')).not.toHaveAttribute('aria-invalid')
  })

  it('locks the rows and the body text, and disables the buttons and the choice, while saving', () => {
    function Locked() {
      const { control, register } = useForm<ServiceFormValues>({
        defaultValues: {
          query_params: [{ name: 'a', value: 'b' }],
          headers: [{ name: 'c', value: 'd' }],
          body_type: 'json',
          body_content: 'x',
        },
      })
      return (
        <RequestRowsGroup
          control={control}
          register={register}
          saving
          serverErrors={{
            errorFor: () => null,
            bareError: () => null,
            clearField: () => undefined,
            clearList: () => undefined,
            clearRows: () => undefined,
            clearBodyType: () => undefined,
          }}
        />
      )
    }
    render(<Locked />)
    for (const label of [
      'Query parameter 1 name',
      'Query parameter 1 value',
      'Header 1 name',
      'Header 1 value',
      'Body',
    ]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('readonly')
    }
    for (const name of ['Add parameter', 'Add header', 'Remove query parameter 1', 'Remove header 1']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
    for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveAttribute('aria-disabled', 'true')
  })
})
