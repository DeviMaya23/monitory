import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import { NameValueRows } from './NameValueRows'

type Values = { rows: { name: string; value: string }[] }

type Words = {
  legend?: ReactNode
  emptyText?: string
  addLabel?: string
  itemName?: string
  hint?: string
}

const HEADER_WORDS: Words = {
  legend: (
    <>
      Custom headers <span className="opt">(optional)</span>
    </>
  ),
  emptyText: 'No custom headers.',
  addLabel: 'Add header',
  itemName: 'Header',
}

const QUERY_WORDS: Words = {
  legend: 'Query parameters',
  emptyText: 'No query parameters.',
  addLabel: 'Add parameter',
  itemName: 'Query parameter',
}

function Harness({
  readOnly = false,
  listError = null,
  errors = {},
  words = {},
}: {
  readOnly?: boolean
  listError?: string | null
  errors?: Record<string, string>
  words?: Words
}) {
  const { register, control } = useForm<Values>({
    defaultValues: { rows: readOnly ? [{ name: 'a', value: 'b' }] : [] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'rows' })
  return (
    <NameValueRows
      legend={words.legend ?? 'Rows'}
      emptyText={words.emptyText ?? 'No rows.'}
      addLabel={words.addLabel ?? 'Add row'}
      itemName={words.itemName ?? 'Row'}
      hint={words.hint}
      rows={fields}
      inputId={(index, part) => `h-${index}-${part}`}
      register={(index, part) => register(`rows.${index}.${part}` as const)}
      errorFor={(index, part) => errors[`${index}.${part}`] ?? null}
      listError={listError}
      readOnly={readOnly}
      onAdd={() => append({ name: '', value: '' })}
      onRemove={remove}
    />
  )
}

describe('NameValueRows with the target dialog’s words', () => {
  it('shows the empty text, then a row named by number with Remove, and focuses its name on add', async () => {
    render(<Harness words={HEADER_WORDS} />)
    expect(screen.getByText('No custom headers.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add header' }))
    expect(screen.queryByText('No custom headers.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Header 1 name')).toHaveFocus()
    expect(screen.getByLabelText('Header 1 value')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove header 1' })).toBeInTheDocument()
  })

  it('moves focus to Add header when the only row goes and back to the empty text', async () => {
    render(<Harness words={HEADER_WORDS} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add header' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove header 1' }))
    expect(screen.getByRole('button', { name: 'Add header' })).toHaveFocus()
    expect(screen.getByText('No custom headers.')).toBeInTheDocument()
  })

  it('moves focus to the next row’s name on Remove, and to the previous row’s when the last row went', async () => {
    render(<Harness words={HEADER_WORDS} />)
    const add = screen.getByRole('button', { name: 'Add header' })
    await userEvent.click(add)
    await userEvent.click(add)
    await userEvent.click(add)
    await userEvent.click(screen.getByRole('button', { name: 'Remove header 1' }))
    expect(screen.getByLabelText('Header 1 name')).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Remove header 2' }))
    expect(screen.getByLabelText('Header 1 name')).toHaveFocus()
  })

  it('shows the legend with its optional mark', () => {
    render(<Harness words={HEADER_WORDS} />)
    expect(screen.getByRole('group', { name: 'Custom headers (optional)' })).toBeInTheDocument()
  })

  it('disables Add and Remove, and makes the inputs read-only, while a save is in flight', () => {
    render(<Harness readOnly words={HEADER_WORDS} />)
    expect(screen.getByRole('button', { name: 'Add header' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove header 1' })).toBeDisabled()
    expect(screen.getByLabelText('Header 1 name')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Header 1 value')).toHaveAttribute('readonly')
  })
})

describe('NameValueRows words', () => {
  it('names the inputs, Remove, empty text and Add from the props, with no hint', async () => {
    const view = render(<Harness words={QUERY_WORDS} />)
    expect(screen.getByText('No query parameters.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add parameter' }))
    expect(screen.getByLabelText('Query parameter 1 name')).toHaveFocus()
    expect(screen.getByLabelText('Query parameter 1 value')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove query parameter 1' })).toBeInTheDocument()
    expect(view.container.querySelector('.hint')).toBeNull()
    expect(screen.getByRole('group', { name: 'Query parameters' })).not.toHaveAttribute('aria-describedby')
  })

  it('shows a hint beside Add, named by the group, and both the hint and a list error when both show', () => {
    render(<Harness words={{ ...QUERY_WORDS, hint: 'Values are shown in full.' }} listError="Too many." />)
    const group = screen.getByRole('group', { name: 'Query parameters' })
    const hint = screen.getByText('Values are shown in full.')
    expect(hint).toHaveClass('hint')
    expect(hint.closest('.rows__foot')).toContainElement(screen.getByRole('button', { name: 'Add parameter' }))
    expect(group).toHaveAccessibleDescription('Values are shown in full. Too many.')
  })

  it('names only the hint when there is no list error', () => {
    render(<Harness words={{ ...QUERY_WORDS, hint: 'Values are shown in full.' }} />)
    expect(screen.getByRole('group', { name: 'Query parameters' })).toHaveAccessibleDescription(
      'Values are shown in full.',
    )
  })
})

describe('NameValueRows errors', () => {
  it('shows a row’s error under its input, linked by aria-describedby, and the list error under the rows', async () => {
    const view = render(<Harness errors={{ '0.name': 'Name is empty.' }} listError="Too many." />)
    await userEvent.click(screen.getByRole('button', { name: 'Add row' }))
    expect(screen.getByLabelText('Row 1 name')).toHaveAccessibleDescription('Name is empty.')
    expect(screen.getByLabelText('Row 1 name')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Row 1 value')).not.toHaveAttribute('aria-invalid')
    expect(view.container).toHaveTextContent('Too many.')
    expect(screen.getByRole('group', { name: 'Rows' })).toHaveAccessibleDescription('Too many.')
  })

  it('shows markup in a message as text (NFR-7)', async () => {
    const view = render(<Harness errors={{ '0.value': '<b>bold</b>' }} listError="<i>list</i>" />)
    await userEvent.click(screen.getByRole('button', { name: 'Add row' }))
    expect(screen.getByText('<b>bold</b>')).toBeInTheDocument()
    expect(screen.getByText('<i>list</i>')).toBeInTheDocument()
    expect(view.container.querySelector('b, i')).toBeNull()
  })
})

describe('two NameValueRows on one page', () => {
  it('share no id, and each group names its own list error and hint', () => {
    function Two() {
      const a = useForm<Values>({ defaultValues: { rows: [] } })
      const b = useForm<Values>({ defaultValues: { rows: [] } })
      const fa = useFieldArray({ control: a.control, name: 'rows' })
      const fb = useFieldArray({ control: b.control, name: 'rows' })
      const common = { readOnly: false, onAdd: () => undefined, onRemove: () => undefined, emptyText: 'e' }
      return (
        <>
          <NameValueRows
            {...common}
            legend="A"
            addLabel="Add a"
            itemName="A"
            hint="Hint A"
            rows={fa.fields}
            inputId={(i, p) => `a-${i}-${p}`}
            register={(i, p) => a.register(`rows.${i}.${p}` as const)}
            errorFor={() => null}
            listError="Error A"
          />
          <NameValueRows
            {...common}
            legend="B"
            addLabel="Add b"
            itemName="B"
            hint="Hint B"
            rows={fb.fields}
            inputId={(i, p) => `b-${i}-${p}`}
            register={(i, p) => b.register(`rows.${i}.${p}` as const)}
            errorFor={() => null}
            listError="Error B"
          />
        </>
      )
    }
    const view = render(<Two />)
    const ids = [...view.container.querySelectorAll('[id]')].map((element) => element.id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    expect(screen.getByRole('group', { name: 'A' })).toHaveAccessibleDescription('Hint A Error A')
    expect(screen.getByRole('group', { name: 'B' })).toHaveAccessibleDescription('Hint B Error B')
  })
})
