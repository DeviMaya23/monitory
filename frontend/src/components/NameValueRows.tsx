import { useCallback, useId, type ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { useRowFocus } from '../hooks/useRowFocus'
import { FieldErrorText } from './FieldErrorText'

type Part = 'name' | 'value'

type Props = {
  /** The group's legend. */
  legend: ReactNode
  /** Shown when there are no rows. */
  emptyText: string
  /** The Add button's text. */
  addLabel: string
  /** What one row is called, for the inputs' and the Remove button's accessible names ("Header"). */
  itemName: string
  /** A hint beside the Add button. */
  hint?: string
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

/** A list of name and value rows with Add and Remove, over a form's field array. The words are props. */
export function NameValueRows({
  legend,
  emptyText,
  addLabel,
  itemName,
  hint,
  rows,
  inputId,
  register,
  errorFor,
  listError,
  readOnly,
  onAdd,
  onRemove,
}: Props) {
  const firstInputId = useCallback((index: number) => inputId(index, 'name'), [inputId])
  const { addButton, addRow, removeRow } = useRowFocus(rows, firstInputId)

  const uid = useId()
  const listErrorId = `${uid}-error`
  const hintId = `${uid}-hint`
  const describedBy = [hint ? hintId : null, listError ? listErrorId : null].filter(Boolean).join(' ')
  return (
    <fieldset className="stack" aria-describedby={describedBy || undefined}>
      <legend className="label rows__legend">{legend}</legend>
      <div className="rows">
        {rows.length === 0 ? (
          <p className="rows__empty">{emptyText}</p>
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
                          aria-label={`${itemName} ${n} ${part}`}
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
                    aria-label={`Remove ${itemName.toLowerCase()} ${n}`}
                    disabled={readOnly}
                    onClick={() => removeRow(index, () => onRemove(index))}
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
          <button type="button" className="btn" ref={addButton} disabled={readOnly} onClick={() => addRow(onAdd)}>
            <Plus className="icon icon--sm" aria-hidden="true" />
            <span>{addLabel}</span>
          </button>
          {hint && (
            <span className="hint" id={hintId}>
              {hint}
            </span>
          )}
        </div>
      </div>
    </fieldset>
  )
}
