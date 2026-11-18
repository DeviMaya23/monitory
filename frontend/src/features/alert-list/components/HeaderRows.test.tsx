import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFieldArray, useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import { HeaderRows } from './HeaderRows'

type Values = { headers: { name: string; value: string }[] }

function Harness({
  readOnly = false,
  listError = null,
  errors = {},
}: {
  readOnly?: boolean
  listError?: string | null
  errors?: Record<string, string>
}) {
  const { register, control } = useForm<Values>({ defaultValues: { headers: readOnly ? [{ name: 'a', value: 'b' }] : [] } })
  const { fields, append, remove } = useFieldArray({ control, name: 'headers' })
  return (
    <HeaderRows
      rows={fields}
      inputId={(index, part) => `h-${index}-${part}`}
      register={(index, part) => register(`headers.${index}.${part}` as const)}
      errorFor={(index, part) => errors[`${index}.${part}`] ?? null}
      listError={listError}
      readOnly={readOnly}
      onAdd={() => append({ name: '', value: '' })}
      onRemove={remove}
    />
  )
}

describe('HeaderRows', () => {
  it('shows the empty text, then a row named by number with Remove, and focuses its name on add', async () => {
    render(<Harness />)
    expect(screen.getByText('No custom headers.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add header' }))
    expect(screen.queryByText('No custom headers.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Header 1 name')).toHaveFocus()
    expect(screen.getByLabelText('Header 1 value')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove header 1' })).toBeInTheDocument()
  })

  it('moves focus to Add header when the only row goes and back to the empty text', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Add header' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove header 1' }))
    expect(screen.getByRole('button', { name: 'Add header' })).toHaveFocus()
    expect(screen.getByText('No custom headers.')).toBeInTheDocument()
  })

  it('shows a row’s error under its input, linked by aria-describedby, and the list error under the rows', async () => {
    const view = render(<Harness errors={{ '0.name': 'Name is empty.' }} listError="Too many." />)
    await userEvent.click(screen.getByRole('button', { name: 'Add header' }))
    expect(screen.getByLabelText('Header 1 name')).toHaveAccessibleDescription('Name is empty.')
    expect(screen.getByLabelText('Header 1 name')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Header 1 value')).not.toHaveAttribute('aria-invalid')
    expect(view.container).toHaveTextContent('Too many.')
  })

  it('disables Add and Remove, and makes the inputs read-only, while a save is in flight', async () => {
    render(<Harness readOnly />)
    expect(screen.getByRole('button', { name: 'Add header' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove header 1' })).toBeDisabled()
    expect(screen.getByLabelText('Header 1 name')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Header 1 value')).toHaveAttribute('readonly')
  })
})
