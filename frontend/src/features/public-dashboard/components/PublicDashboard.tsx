import { CircleCheck, CircleX, EyeOff, ListPlus, LoaderCircle, RefreshCw } from 'lucide-react'
import { REFRESH_INTERVAL_MS } from '../../../lib/config'
import { formatTime } from '../../../lib/formatTime'
import type { PublicDashboardView } from '../hooks/usePublicDashboard'
import { PublicBanner } from './PublicBanner'
import { PublicRow } from './PublicRow'
import '../public-dashboard.css'

const SKELETON_ROWS = [0, 1, 2, 3]

function Summary({ services }: { services: PublicDashboardView['services'] }) {
  const unhealthy = services.filter((s) => s.status === 'unhealthy').length
  if (unhealthy === 0) {
    return (
      <p className="pub-summary pub-summary--ok">
        <CircleCheck className="icon icon--sm" aria-hidden="true" />
        All services healthy
      </p>
    )
  }
  return (
    <p className="pub-summary pub-summary--bad">
      <CircleX className="icon icon--sm" aria-hidden="true" />
      {unhealthy} of {services.length} {services.length === 1 ? 'service' : 'services'} unhealthy
    </p>
  )
}

function Meta({ lastSuccessAt, now }: { lastSuccessAt: number | null; now: Date }) {
  const minutes = Math.round(REFRESH_INTERVAL_MS / 60_000)
  if (lastSuccessAt === null) return <span className="refresh-meta">Refreshes every {minutes} min</span>
  const iso = new Date(lastSuccessAt).toISOString()
  return (
    <span className="refresh-meta">
      Updated <time dateTime={iso}>{formatTime(iso, now)}</time> · every {minutes} min
    </span>
  )
}

function RefreshBlock({ view, now }: { view: PublicDashboardView; now: Date }) {
  const counting = view.rateLimit !== null && view.rateLimit.secondsLeft !== null && view.rateLimit.secondsLeft > 0
  return (
    <div className="pub-refresh">
      <Meta lastSuccessAt={view.lastSuccessAt} now={now} />
      <button
        type="button"
        className="btn"
        disabled={view.fetching || counting}
        aria-busy={view.fetching ? true : undefined}
        onClick={view.refresh}
      >
        {view.fetching ? (
          <LoaderCircle className="icon icon--sm spinner" aria-hidden="true" />
        ) : (
          <RefreshCw className="icon icon--sm" aria-hidden="true" />
        )}
        <span>{view.fetching ? 'Refreshing…' : 'Refresh'}</span>
      </button>
    </div>
  )
}

function Skeleton() {
  return (
    <>
      <p className="sr-only" role="status">
        Loading service status…
      </p>
      <ul className="pub-list">
        {SKELETON_ROWS.map((n) => (
          <li key={n} className="pub-row" aria-hidden="true">
            <span className="skeleton pub-skeleton__name" />
            <span className="skeleton pub-skeleton__badge" />
            <span className="skeleton pub-skeleton__time" />
          </li>
        ))}
      </ul>
    </>
  )
}

function StateBlock({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="pub-state">
      {icon}
      <h2 className="empty__title">{title}</h2>
      <p className="muted">{text}</p>
    </div>
  )
}

function Content({ view, now }: { view: PublicDashboardView; now: Date }) {
  switch (view.state) {
    case 'loading':
      return <Skeleton />
    case 'unavailable':
      return (
        <StateBlock
          icon={<EyeOff className="icon empty__icon" aria-hidden="true" />}
          title="This status page isn’t available"
          text="It has been turned off."
        />
      )
    case 'empty':
      return (
        <StateBlock
          icon={<ListPlus className="icon empty__icon" aria-hidden="true" />}
          title="No services to show"
          text="This status page is on, but no services have been added to it yet."
        />
      )
    case 'list':
      return (
        <ul className="pub-list" aria-label="Services">
          {view.services.map((service, index) => (
            // The rows have no id; the server's order is the identity.
            <PublicRow key={index} service={service} now={now} />
          ))}
        </ul>
      )
    default:
      return null
  }
}

/** The anonymous public status page (FR-28 to FR-32, FR-40, FR-63). */
export function PublicDashboard({ view }: { view: PublicDashboardView }) {
  const now = new Date()
  const unavailable = view.state === 'unavailable'
  const showFoot = view.state === 'loading' || view.state === 'list' || view.state === 'empty'

  return (
    <main className="pub">
      <header className="pub-head">
        <div className="pub-head__titles">
          <h1 className="pub-title">Service status</h1>
          {view.state === 'list' && <Summary services={view.services} />}
        </div>
        {!unavailable && <RefreshBlock view={view} now={now} />}
      </header>
      {!unavailable && (
        <div aria-live="polite">
          <PublicBanner view={view} now={now} />
        </div>
      )}
      <Content view={view} now={now} />
      {showFoot && <p className="pub-foot">Times are shown in your local time.</p>}
    </main>
  )
}
