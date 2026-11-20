import type { Ref } from 'react'
import { CircleAlert } from 'lucide-react'
import type { SummaryEntry } from '../hooks/useServerErrors'
import { fieldId } from '../lib/fieldIds'
import { summaryTitle, type FieldTarget } from '../lib/fieldLabels'

type Props = {
  /** At least one entry. */
  entries: readonly SummaryEntry[]
  /** An entry's link was activated: move focus to its field. */
  onGoToField: (target: FieldTarget) => void
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
          {entries.map(({ key, label, message, target }) => (
            <li key={key}>
              {target === null ? (
                <>
                  {label}: {message}
                </>
              ) : (
                <a
                  href={`#${fieldId(target)}`}
                  onClick={(event) => {
                    event.preventDefault()
                    onGoToField(target)
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
