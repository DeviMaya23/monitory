import { BellOff, RefreshCw, WifiOff } from 'lucide-react'
import { Link } from 'react-router'

/** The alert list's live region: "Something went wrong." first, then "Alerts are off for this service." */
export function AlertListBanners({
  serviceId,
  failed,
  fetching,
  alertsOff,
  onRetry,
}: {
  serviceId: string
  /** The list could not be loaded or reloaded. */
  failed: boolean
  fetching: boolean
  /** The service is known to have alerts off and its list is on screen. */
  alertsOff: boolean
  onRetry: () => void
}) {
  return (
    <div className="alerts-banners" aria-live="polite">
      {failed && (
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
      )}
      {alertsOff && (
        <div className="banner banner--warn" role="status">
          <BellOff className="icon" aria-hidden="true" />
          <div className="banner__body">
            <span className="banner__title">Alerts are off for this service.</span>
            <span>These targets receive nothing until alerts are turned on.</span>
          </div>
          <div className="banner__actions">
            <Link className="btn" to={`/services/${encodeURIComponent(serviceId)}`}>
              Edit service
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
