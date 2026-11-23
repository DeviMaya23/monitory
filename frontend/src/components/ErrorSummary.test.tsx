import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorSummary, type SummaryEntry } from './ErrorSummary'

const entry = (key: number, over: Partial<SummaryEntry> = {}): SummaryEntry => ({
  key,
  label: `Field ${key}`,
  message: `Message ${key}`,
  inputId: `input-${key}`,
  ...over,
})

function setup(entries: SummaryEntry[], onGoToField = vi.fn()) {
  const ref = createRef<HTMLDivElement>()
  render(<ErrorSummary entries={entries} onGoToField={onGoToField} ref={ref} />)
  return { ref, onGoToField }
}

describe('ErrorSummary (FR-12, FR-74)', () => {
  it('titles one entry and three entries', () => {
    setup([entry(0)])
    expect(screen.getByText('1 field needs fixing before this can be saved.')).toBeInTheDocument()
    document.body.innerHTML = ''
    setup([entry(0), entry(1), entry(2)])
    expect(screen.getByText('3 fields need fixing before this can be saved.')).toBeInTheDocument()
  })

  it('links an entry with an input id: the click calls the handler with it and does not navigate', () => {
    const { onGoToField } = setup([entry(0), entry(1)])
    const link = screen.getByRole('link', { name: 'Field 1: Message 1' })
    expect(link).toHaveAttribute('href', '#input-1')
    expect(fireEvent.click(link)).toBe(false) // default prevented
    expect(onGoToField).toHaveBeenCalledExactlyOnceWith('input-1')
  })

  it('shows an entry with a null input id as plain text', () => {
    setup([entry(0, { inputId: null })])
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Field 0: Message 0')).toBeInTheDocument()
  })

  it('is an alert that can take focus, and forwards its ref', () => {
    const { ref } = setup([entry(0)])
    const root = screen.getByRole('alert')
    expect(root).toHaveAttribute('tabindex', '-1')
    expect(ref.current).toBe(root)
  })

  it('shows a message with markup as text (NFR-7)', () => {
    setup([entry(0, { message: '<b>bold</b>' })])
    expect(screen.getByRole('alert').querySelector('b')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('<b>bold</b>')
  })
})
