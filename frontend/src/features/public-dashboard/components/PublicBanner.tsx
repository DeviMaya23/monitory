import { Clock, RefreshCw, TriangleAlert } from 'lucide-react'
import type { PublicDashboardView } from '../hooks/usePublicDashboard'
import { formatTime } from '../../../lib/formatTime'

function RetryButton({ view }: { view: PublicDashboardView }) {
  return (
    <button type="button" className="btn" disabled={view.fetching} onClick={view.refresh}>
      <RefreshCw className="icon icon--sm" aria-hidden="true" />
      <span>Retry</span>
    </button>
  )
}

function RateLimitLine({ secondsLeft }: { secondsLeft: number | null }) {
  if (secondsLeft === null) return <span>Try again in a moment.</span>
  return (
    <span>
      Try again in <span className="tabular">{secondsLeft}</span> {secondsLeft === 1 ? 'second' : 'seconds'}.
    </span>
  )
}

/** The warning banner for the current state: too many requests, could not load, or could not refresh. Null when none applies. */
export function PublicBanner({ view, now }: { view: PublicDashboardView; now: Date }) {
  if (view.state === 'unavailable' || view.state === 'loading') return null

  if (view.rateLimit !== null) {
    return (
      <div className="pub-banner">
        <div className="banner banner--warn" role="status">
          <Clock className="icon" aria-hidden="true" />
          <div className="banner__body">
            <span className="banner__title">Too many requests.</span>
            <RateLimitLine secondsLeft={view.rateLimit.secondsLeft} />
          </div>
        </div>
      </div>
    )
  }

  const couldNotLoad = view.state === 'could-not-load'
  if (!couldNotLoad && !view.refreshFailed) return null
  return (
    <div className="pub-banner">
      <div className="banner banner--warn" role="status">
        <TriangleAlert className="icon" aria-hidden="true" />
        <div className="banner__body">
          <span className="banner__title">{couldNotLoad ? 'Couldn’t load service status.' : 'Couldn’t refresh.'}</span>
          {!couldNotLoad && view.lastSuccessAt !== null && (
            <span>Showing status from {formatTime(new Date(view.lastSuccessAt).toISOString(), now)}.</span>
          )}
        </div>
        <div className="banner__actions">
          <RetryButton view={view} />
        </div>
      </div>
    </div>
  )
}
