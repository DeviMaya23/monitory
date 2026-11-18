import { useEffect, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { FieldErrorText } from './FieldErrorText'

type Part = 'name' | 'value'

type Props = {
  /** The rows of the form's field array, in order. */
  rows: readonly { id: string }[]
  /** The element id of a row's input. */
  inputId: (index: number, part: Part) => string
  /** The form's registration of a row's input. */
  register: (index: number, part: Part) => UseFormRegisterReturn
  /** The message to show under a row's input. */
  errorFor: (index: number, part: Part) => string | null
  /** The message about the rows as a whole (too many). */
  listError: string | null
  /** A save is in flight. */
  readOnly: boolean
  onAdd: () => void
  onRemove: (index: number) => void
}

const errorId = (id: string) => `${id}-error`

/** A list of name and value rows with Add and Remove, over a form's field array. */
export function HeaderRows({ rows, inputId, register, errorFor, listError, readOnly, onAdd, onRemove }: Props) {
  const addButton = useRef<HTMLButtonElement>(null)
  // Where focus goes once the rows have changed: a row's name input, or Add header.
  const focusAfter = useRef<{ index: number } | 'add' | null>(null)

  useEffect(() => {
    const target = focusAfter.current
    if (target === null) return
    focusAfter.current = null
    if (target === 'add') addButton.current?.focus()
    else document.getElementById(inputId(target.index, 'name'))?.focus()
  }, [rows, inputId])

  const remove = (index: number) => {
    focusAfter.current = index < rows.length - 1 ? { index } : index > 0 ? { index: index - 1 } : 'add'
    onRemove(index)
  }
  const add = () => {
    focusAfter.current = { index: rows.length }
    onAdd()
  }

  const listErrorId = 'header-rows-error'
  return (
    <fieldset className="stack" aria-describedby={listError ? listErrorId : undefined}>
      <legend className="label header-rows__legend">
        Custom headers <span className="opt">(optional)</span>
      </legend>
      <div className="rows">
        {rows.length === 0 ? (
          <p className="rows__empty">No custom headers.</p>
        ) : (
          <>
            <div className="rows__head" aria-hidden="true">
              <span>Name</span>
              <span>Value</span>
              <span />
            </div>
            {rows.map((row, index) => {
              const n = index + 1
              const parts: Part[] = ['name', 'value']
              return (
                <div className="kv" key={row.id}>
                  {parts.map((part) => {
                    const id = inputId(index, part)
                    const message = errorFor(index, part)
                    return (
                      <div className="kv__cell" key={part}>
                        <span className="kv__label" aria-hidden="true">
                          {part === 'name' ? 'Name' : 'Value'}
                        </span>
                        <input
                          className="input input--mono"
                          id={id}
                          type="text"
                          aria-label={`Header ${n} ${part}`}
                          readOnly={readOnly}
                          aria-invalid={message ? 'true' : undefined}
                          aria-describedby={message ? errorId(id) : undefined}
                          {...register(index, part)}
                        />
                        {message && <FieldErrorText id={errorId(id)} message={message} />}
                      </div>
                    )
                  })}
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    aria-label={`Remove header ${n}`}
                    disabled={readOnly}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="icon" aria-hidden="true" />
                  </button>
                </div>
              )
            })}
          </>
        )}
        {listError && <FieldErrorText id={listErrorId} message={listError} />}
        <div className="rows__foot">
          <button type="button" className="btn" ref={addButton} disabled={readOnly} onClick={add}>
            <Plus className="icon icon--sm" aria-hidden="true" />
            <span>Add header</span>
          </button>
        </div>
      </div>
    </fieldset>
  )
}
