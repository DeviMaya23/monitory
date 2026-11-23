import { useRef } from 'react'
import { ListPlus, LoaderCircle, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { REFRESH_INTERVAL_MS } from '../../../lib/config'
import type { DeleteServiceFlow } from '../hooks/useDeleteService'
import type { PauseServiceFlow } from '../hooks/usePauseService'
import type { PublicViewFlow } from '../hooks/usePublicView'
import type { ServiceListView } from '../hooks/useServiceList'
import { formatTime } from '../../../lib/formatTime'
import { DeleteServiceDialog } from './DeleteServiceDialog'
import { PublicToggle } from './PublicToggle'
import { ServiceRow } from './ServiceRow'
import '../service-list.css'

// Five rows, each with its own name width, as the board draws them.
const SKELETON_WIDTHS = ['45%', '70%', '35%', '55%', '40%']

function headingLine({ state, services }: ServiceListView): string {
  const count =
    state === 'loading'
      ? 'Loading'
      : state === 'could-not-load'
        ? 'Not loaded'
        : state === 'empty'
          ? 'No services'
          : services.length === 1
            ? '1 service'
            : `${services.length} services`
  return `${count} · times in your local time`
}

function RetryButton({ view, onRetry }: { view: ServiceListView; onRetry: () => void }) {
  return (
    <button type="button" className="btn" disabled={view.fetching} onClick={onRetry}>
      <RefreshCw className="icon icon--sm" aria-hidden="true" />
      <span>Retry</span>
    </button>
  )
}

function Banner({ view, now, onRetry }: { view: ServiceListView; now: Date; onRetry: () => void }) {
  const couldNotLoad = view.state === 'could-not-load'
  if (!couldNotLoad && !view.refreshFailed) return null
  return (
    <div className="dash-banner">
      <div className="banner banner--warn" role="status">
        <TriangleAlert className="icon" aria-hidden="true" />
        <div className="banner__body">
          <span className="banner__title">{couldNotLoad ? 'Couldn’t load services.' : 'Couldn’t refresh.'}</span>
          {!couldNotLoad && view.lastSuccessAt !== null && (
            <span>Showing data from {formatTime(new Date(view.lastSuccessAt).toISOString(), now)}.</span>
          )}
        </div>
        <div className="banner__actions">
          <RetryButton view={view} onRetry={onRetry} />
        </div>
      </div>
    </div>
  )
}

function Meta({ view, now }: { view: ServiceListView; now: Date }) {
  const minutes = Math.round(REFRESH_INTERVAL_MS / 60_000)
  if (view.state === 'loading') return <span className="refresh-meta">Loading…</span>
  if (view.lastSuccessAt === null) {
    return <span className="refresh-meta">Not loaded yet · auto every {minutes} min</span>
  }
  const iso = new Date(view.lastSuccessAt).toISOString()
  return (
    <span className="refresh-meta">
      Updated{' '}
      <strong>
        <time dateTime={iso}>{formatTime(iso, now)}</time>
      </strong>{' '}
      · auto every {minutes} min
    </span>
  )
}

function Skeleton() {
  return (
    <>
      <p className="sr-only" role="status">
        Loading services…
      </p>
      <div className="svc-list" aria-busy="true">
        <ul>
          {SKELETON_WIDTHS.map((width) => (
            <li key={width} className="svc loading-row" aria-hidden="true">
              <span className="skeleton skeleton--badge" />
              <div className="svc__main">
                <span className="skeleton" style={{ width }} />
              </div>
              <span className="skeleton svc__check" />
              <span className="skeleton svc__change" />
              <span className="skeleton skeleton--flags" />
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function AddServiceLink() {
  return (
    <Link className="btn btn--primary" to="/services/new">
      <Plus className="icon icon--sm" aria-hidden="true" />
      <span>Add service</span>
    </Link>
  )
}

/** The admin dashboard: heading, toolbar, and the content of the current state (FR-9, FR-62, FR-95). */
export function ServiceList({
  view,
  deletion,
  pausing,
  publicView,
}: {
  view: ServiceListView
  deletion: DeleteServiceFlow
  pausing: PauseServiceFlow
  publicView: PublicViewFlow
}) {
  const now = new Date()
  // Refresh and Retry fetch the list and the setting together (FR-95).
  const refreshAll = () => {
    view.refresh()
    publicView.refresh()
  }
  const heading = useRef<HTMLHeadingElement>(null)
  // After a removal the opener is gone: focus goes to the heading. Otherwise back to the Delete button.
  const finalFocus = () => (deletion.closedAs === 'removed' ? heading.current : null)
  return (
    <main className="page">
      <div className="page-head">
        <div className="page-head__titles">
          <h1 className="page-title" ref={heading} tabIndex={-1}>Services</h1>
          <p className="page-sub">{headingLine(view)}</p>
        </div>
      </div>

      <div className="dash-toolbar">
        <AddServiceLink />
        <button
          type="button"
          className="btn"
          disabled={view.fetching}
          aria-busy={view.fetching ? 'true' : undefined}
          onClick={refreshAll}
        >
          {view.fetching ? (
            <LoaderCircle className="icon icon--sm spinner" aria-hidden="true" />
          ) : (
            <RefreshCw className="icon icon--sm" aria-hidden="true" />
          )}
          <span>Refresh</span>
        </button>
        <Meta view={view} now={now} />
        <span className="dash-toolbar__spacer" />
        <PublicToggle publicView={publicView} />
      </div>

      <Banner view={view} now={now} onRetry={refreshAll} />

      {view.state === 'loading' && <Skeleton />}
      {view.state === 'empty' && (
        <div className="empty">
          <ListPlus className="icon empty__icon" aria-hidden="true" />
          <h2 className="empty__title">No services yet</h2>
          <p>
            Add a web endpoint or a TCP port. Monitory checks it in the background and alerts you when it goes down
            or recovers.
          </p>
          <AddServiceLink />
        </div>
      )}
      {view.state === 'list' && (
        <div className="svc-list">
          <div className="svc-head" aria-hidden="true">
            <span>Status</span>
            <span>Service</span>
            <span>Last check</span>
            <span>Last change</span>
            <span>Alerts</span>
            <span>Public</span>
            <span>Actions</span>
          </div>
          <ul aria-label="Services">
            {view.services.map((service) => (
              <ServiceRow
                key={service.id}
                service={service}
                now={now}
                onDelete={deletion.ask}
                onToggle={pausing.toggle}
                toggling={pausing.isPending(service.id)}
              />
            ))}
          </ul>
        </div>
      )}
      <DeleteServiceDialog
        service={deletion.asked}
        deleting={deletion.deleting}
        onCancel={deletion.cancel}
        onConfirm={deletion.confirm}
        finalFocus={finalFocus}
      />
    </main>
  )
}
