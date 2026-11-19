import type { ReactNode, Ref } from 'react'
import { CircleAlert, RefreshCw, WifiOff } from 'lucide-react'
import type { SummaryEntry } from '../hooks/useTargetServerErrors'
import type { SaveFailure } from '../hooks/useSaveTarget'
import { summaryTitle } from '../lib/targetFields'

type SummaryProps = {
  /** At least one entry. */
  entries: readonly SummaryEntry[]
  /** An entry's link was activated: move focus to its input. */
  onGoToField: (inputId: string) => void
  /** The banner itself, so focus can be moved to it. */
  ref: Ref<HTMLDivElement>
}

/** The `422` summary: how many fields need fixing, and each of the server's messages. */
export function TargetErrorSummary({ entries, onGoToField, ref }: SummaryProps) {
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

type Props = {
  /** The failure of the action started last; only the kinds that are banners show here. */
  failure: SaveFailure | null
  /** An edit is open: `full` is not a banner there. */
  editing: boolean
  /** "Try again": repeat the action that failed, the save or the test, as the form is. */
  onRetry: () => void
  /** "Close and refresh" of a target that is gone. */
  onCloseAndRefresh: () => void
  /** That banner's button, so focus can be moved to it. */
  refreshRef: Ref<HTMLButtonElement>
  /** The error summary, which sits in the same live region. */
  children?: ReactNode
}

function Banner({ failure, editing, onRetry, onCloseAndRefresh, refreshRef }: Omit<Props, 'children'>) {
  switch (failure?.kind) {
    case 'full':
      return (
        <div className="banner banner--error" role="alert">
          <CircleAlert className="icon" aria-hidden="true" />
          <div className="banner__body">
            <span className="banner__title">This alert list is full.</span>
            <span>Remove a target before adding another.</span>
          </div>
        </div>
      )
    case 'not-found':
      // On an add the dialog has closed already.
      if (!editing) return null
      return (
        <div className="banner banner--error" role="alert">
          <CircleAlert className="icon" aria-hidden="true" />
          <div className="banner__body">
            <span className="banner__title">This target no longer exists.</span>
            <span>It was removed, perhaps in another tab.</span>
          </div>
          <div className="banner__actions">
            <button type="button" className="btn" ref={refreshRef} onClick={onCloseAndRefresh}>
              <span>Close and refresh</span>
            </button>
          </div>
        </div>
      )
    case 'csrf':
      return (
        <div className="banner banner--error" role="alert">
          <CircleAlert className="icon" aria-hidden="true" />
          <div className="banner__body">
            <span className="banner__title">The request wasn’t accepted.</span>
            <span>Reload the page and try again.</span>
          </div>
          <div className="banner__actions">
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              <RefreshCw className="icon icon--sm" aria-hidden="true" />
              <span>Reload</span>
            </button>
          </div>
        </div>
      )
    case 'unexpected':
      return (
        <div className="banner banner--error" role="alert">
          <WifiOff className="icon" aria-hidden="true" />
          <div className="banner__body">
            <span className="banner__title">Something went wrong.</span>
            <span>The server couldn’t be reached or returned an error. Your values are still here.</span>
          </div>
          <div className="banner__actions">
            <button type="button" className="btn" onClick={onRetry}>
              <RefreshCw className="icon icon--sm" aria-hidden="true" />
              <span>Try again</span>
            </button>
          </div>
        </div>
      )
    default:
      return null
  }
}

/** The dialog's live region: the error summary first, then the banner of a save that failed as a whole. */
export function TargetDialogBanners({ children, ...banner }: Props) {
  return (
    <div className="form-banners" aria-live="polite">
      {children}
      <Banner {...banner} />
    </div>
  )
}
