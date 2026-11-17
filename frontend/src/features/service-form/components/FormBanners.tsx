import type { ReactNode } from 'react'
import { CircleAlert, RefreshCw, WifiOff } from 'lucide-react'
import { Link } from 'react-router'
import type { CreateFailure } from '../hooks/useCreateService'

type Props = {
  /** The last save's failure; only the kinds that are banners show here. */
  failure: CreateFailure | null
  /** "Try again": submit the form again as it is. */
  onRetry: () => void
  /** The error summary, which sits in the same live region. */
  children?: ReactNode
}

function Banner({ failure, onRetry }: Pick<Props, 'failure' | 'onRetry'>) {
  switch (failure?.kind) {
    case 'limit':
      return (
        <div className="banner banner--error" role="alert">
          <CircleAlert className="icon" aria-hidden="true" />
          <div className="banner__body">
            <span className="banner__title">Service limit reached.</span>
            <span>This install can’t hold more services. Delete one to add this one.</span>
          </div>
          <div className="banner__actions">
            <Link className="btn" to="/">
              Back to services
            </Link>
          </div>
        </div>
      )
    case 'too-large':
      return (
        <div className="banner banner--error" role="alert">
          <CircleAlert className="icon" aria-hidden="true" />
          <div className="banner__body">
            <span className="banner__title">The service is too large to save.</span>
            <span>Together its fields are over 1 MB. Shorten the name or the URL.</span>
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

/** The form's live region: the error summary, and the banner of a save that failed as a whole (FR-60, NFR-8). */
export function FormBanners({ failure, onRetry, children }: Props) {
  return (
    <div className="form-banners" aria-live="polite">
      {children}
      <Banner failure={failure} onRetry={onRetry} />
    </div>
  )
}
