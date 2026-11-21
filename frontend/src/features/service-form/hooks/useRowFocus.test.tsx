import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useRowFocus } from './useRowFocus'

const inputId = (index: number) => `row-${index}`

function Harness({ start }: { start: number }) {
  const [rows, setRows] = useState(() => Array.from({ length: start }, (_, i) => ({ id: `r${i}` })))
  const { addButton, addRow, removeRow } = useRowFocus(rows, inputId)
  return (
    <div>
      {rows.map((row, index) => (
        <div key={row.id}>
          <input id={inputId(index)} aria-label={`input ${index}`} />
          <button type="button" onClick={() => removeRow(index, () => setRows(rows.filter((_, i) => i !== index)))}>
            remove {index}
          </button>
        </div>
      ))}
      <button
        type="button"
        ref={addButton}
        onClick={() => addRow(() => setRows([...rows, { id: `r${Math.random()}` }]))}
      >
        add
      </button>
    </div>
  )
}

describe('useRowFocus', () => {
  it('focuses the input of the added row', async () => {
    render(<Harness start={1} />)
    await userEvent.click(screen.getByRole('button', { name: 'add' }))
    expect(screen.getByLabelText('input 1')).toHaveFocus()
  })

  it('focuses the next row after a removal, the previous one when the last went, and Add when none is left', async () => {
    render(<Harness start={3} />)
    await userEvent.click(screen.getByRole('button', { name: 'remove 1' }))
    expect(screen.getByLabelText('input 1')).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'remove 1' }))
    expect(screen.getByLabelText('input 0')).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'remove 0' }))
    expect(screen.getByRole('button', { name: 'add' })).toHaveFocus()
  })
})
