import { CircleAlert, RefreshCw, WifiOff } from 'lucide-react'
import { RELOAD_LABEL, REQUEST_NOT_ACCEPTED_TEXT, REQUEST_NOT_ACCEPTED_TITLE } from '../lib/requestNotAccepted'

/** The server refused the request's CSRF token (NFR-8): reload the page. */
export function CsrfBanner() {
  return (
    <div className="banner banner--error" role="alert">
      <CircleAlert className="icon" aria-hidden="true" />
      <div className="banner__body">
        <span className="banner__title">{REQUEST_NOT_ACCEPTED_TITLE}</span>
        <span>{REQUEST_NOT_ACCEPTED_TEXT}</span>
      </div>
      <div className="banner__actions">
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          <RefreshCw className="icon icon--sm" aria-hidden="true" />
          <span>{RELOAD_LABEL}</span>
        </button>
      </div>
    </div>
  )
}

/** A save or test failed as a whole; the admin's values are still in the form. */
export function UnexpectedBanner({ onRetry }: { onRetry: () => void }) {
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
}

/** Something could not be loaded: a warning with `Try again`, disabled while a request is in flight. */
export function LoadFailedBanner({ fetching, onRetry }: { fetching: boolean; onRetry: () => void }) {
  return (
    <div className="banner banner--warn" role="status">
      <WifiOff className="icon" aria-hidden="true" />
      <div className="banner__body">
        <span className="banner__title">Something went wrong.</span>
        <span>The server couldn’t be reached or returned an error.</span>
      </div>
      <div className="banner__actions">
        <button type="button" className="btn" disabled={fetching} onClick={onRetry}>
          <RefreshCw className="icon icon--sm" aria-hidden="true" />
          <span>Try again</span>
        </button>
      </div>
    </div>
  )
}
