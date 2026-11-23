import { BellOff } from 'lucide-react'
import { Link } from 'react-router'
import { LoadFailedBanner } from '../../../components/FailureBanners'

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
      {failed && <LoadFailedBanner fetching={fetching} onRetry={onRetry} />}
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
