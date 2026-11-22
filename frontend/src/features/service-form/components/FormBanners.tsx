import type { ReactNode, RefObject } from 'react'
import { CircleAlert, RefreshCw, WifiOff } from 'lucide-react'
import { Link } from 'react-router'
import type { SaveFailure } from '../hooks/useSaveService'
import { LEAVE_WITHOUT_ASKING } from '../hooks/useLeaveGuard'

type Props = {
  /** The last save's failure; only the kinds that are banners show here. */
  failure: SaveFailure | null
  /** "Try again": submit the form again as it is. */
  onRetry: () => void
  /** The `Back to services` link of the not-found banner, which takes focus when the banner appears. */
  notFoundLinkRef?: RefObject<HTMLAnchorElement | null>
  /** The error summary, which sits in the same live region. */
  children?: ReactNode
}

function Banner({ failure, onRetry, notFoundLinkRef }: Pick<Props, 'failure' | 'onRetry' | 'notFoundLinkRef'>) {
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
            <Link className="btn" to="/" state={LEAVE_WITHOUT_ASKING}>
              Back to services
            </Link>
          </div>
        </div>
      )
    case 'not-found':
      return (
        <div className="banner banner--error" role="alert">
          <CircleAlert className="icon" aria-hidden="true" />
          <div className="banner__body">
            <span className="banner__title">This service no longer exists.</span>
            <span>It was deleted, perhaps in another tab. It can’t be saved.</span>
          </div>
          <div className="banner__actions">
            <Link className="btn" to="/" state={LEAVE_WITHOUT_ASKING} ref={notFoundLinkRef}>
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
            <span>Together its fields are over 1 MB. Shorten the body or the header values.</span>
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
export function FormBanners({ failure, onRetry, notFoundLinkRef, children }: Props) {
  return (
    <div className="form-banners" aria-live="polite">
      {children}
      <Banner failure={failure} onRetry={onRetry} notFoundLinkRef={notFoundLinkRef} />
    </div>
  )
}
