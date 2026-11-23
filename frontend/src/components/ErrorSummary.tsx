import type { Ref } from 'react'
import { CircleAlert } from 'lucide-react'
import { summaryTitle } from '../lib/summaryTitle'

export type SummaryEntry = {
  /** Stable within one response. */
  key: number
  label: string
  message: string
  /** The input the entry links to; null when the path has no input on this screen. */
  inputId: string | null
}

type Props = {
  /** At least one entry. */
  entries: readonly SummaryEntry[]
  /** An entry's link was activated: move focus to the input with this id. */
  onGoToField: (inputId: string) => void
  /** The banner itself, so focus can be moved to it. */
  ref: Ref<HTMLDivElement>
}

/** The `422` summary: how many fields need fixing, and each of the server's messages (FR-12, FR-74). */
export function ErrorSummary({ entries, onGoToField, ref }: Props) {
  return (
    <div className="banner banner--error" role="alert" tabIndex={-1} ref={ref}>
      <CircleAlert className="icon" aria-hidden="true" />
      <div className="banner__body">
        <span className="banner__title">{summaryTitle(entries.length)}</span>
        <ul className="form-summary">
          {entries.map(({ key, label, message, inputId }) => (
            <li key={key}>
              {inputId === null ? (
                <>
                  {label}: {message}
                </>
              ) : (
                <a
                  href={`#${inputId}`}
                  onClick={(event) => {
                    event.preventDefault()
                    onGoToField(inputId)
                  }}
                >
                  {label}: {message}
                </a>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
