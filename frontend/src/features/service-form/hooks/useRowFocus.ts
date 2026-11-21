import { useEffect, useRef } from 'react'

/**
 * Where focus goes after a row is added or removed (NFR-4): an added row's first input; after
 * a removal the next row's, else the previous row's, else the Add button. The same rule as
 * `NameValueRows`, kept here for the rules (a shared hook needs the user's approval).
 */
export function useRowFocus(rows: readonly { id: string }[], firstInputId: (index: number) => string) {
  const addButton = useRef<HTMLButtonElement>(null)
  const focusAfter = useRef<{ index: number } | 'add' | null>(null)

  useEffect(() => {
    const target = focusAfter.current
    if (target === null) return
    focusAfter.current = null
    if (target === 'add') addButton.current?.focus()
    else document.getElementById(firstInputId(target.index))?.focus()
  }, [rows, firstInputId])

  return {
    /** The ref of the Add button. */
    addButton,
    /** Runs `add`, then focuses the new row. */
    addRow: (add: () => void) => {
      focusAfter.current = { index: rows.length }
      add()
    },
    /** Runs `remove`, then focuses the neighbour. */
    removeRow: (index: number, remove: () => void) => {
      focusAfter.current = index < rows.length - 1 ? { index } : index > 0 ? { index: index - 1 } : 'add'
      remove()
    },
  }
}
