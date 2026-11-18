import { useEffect, useRef } from 'react'
import { ArrowLeft, BellOff, CircleAlert } from 'lucide-react'
import { Link } from 'react-router'
import type { Service } from '../../../lib/api/services'
import type { RemovalClosed, RemoveTargetFlow } from '../hooks/useRemoveTarget'
import type { TargetListView } from '../hooks/useTargetList'
import { AlertListBanners } from './AlertListBanners'
import { TargetRow } from './TargetRow'
import '../alert-list.css'

const SKELETON_ROWS = [0, 1, 2]

function subLine(count: number): string {
  const targets = count === 0 ? 'No targets' : count === 1 ? '1 target' : `${count} targets`
  return `${targets} · in the order added`
}

function ServiceGone() {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  return (
    <main className="page">
      <div className="empty">
        <CircleAlert className="icon empty__icon" aria-hidden="true" />
        <h2 className="empty__title" ref={heading} tabIndex={-1}>
          This service no longer exists
        </h2>
        <p>It was deleted, so its alert list is gone too.</p>
        <Link className="btn btn--primary" to="/">
          Back to services
        </Link>
      </div>
    </main>
  )
}

/**
 * A service's alert list (FR-17, FR-18): the targets, or the state that stands in for them, and the
 * inline removal of one. `service` is the cached service list's entry, or none while it is unknown.
 */
export function AlertList({
  serviceId,
  service,
  view,
  removal,
}: {
  serviceId: string
  service: Service | null
  view: TargetListView
  removal: RemoveTargetFlow
}) {
  const title = useRef<HTMLHeadingElement>(null)
  const removeButtons = useRef(new Map<string, HTMLButtonElement>())
  // Where the removed row stood, noted when the removal is sent.
  const removedIndex = useRef(-1)
  const handled = useRef<RemovalClosed | null>(null)
  const { closed, removing } = removal

  // Once a removal has settled and the list has updated, focus goes where the outcome is.
  useEffect(() => {
    if (!closed || handled.current === closed || removing || view.state === 'not-found') return
    if (closed.as === 'removed' && view.targets.some((target) => target.id === closed.id)) return
    handled.current = closed
    if (closed.as === 'kept') {
      removeButtons.current.get(closed.id)?.focus()
      return
    }
    const next = view.targets[removedIndex.current]
    const button = next ? removeButtons.current.get(next.id) : undefined
    ;(button ?? title.current)?.focus()
  })

  if (view.state === 'not-found') return <ServiceGone />

  const showsList = view.state === 'list' || view.state === 'empty'
  const confirm = () => {
    removedIndex.current = view.targets.findIndex((target) => target.id === removal.askedId)
    removal.confirm()
  }

  return (
    <main className="page">
      <Link className="back-link" to="/">
        <ArrowLeft className="icon icon--sm" aria-hidden="true" />
        Services
      </Link>
      <div className="page-head">
        <div className="page-head__titles">
          <h1 className="page-title" ref={title} tabIndex={-1}>
            Alert list
            {service && (
              <>
                {': '}
                <span className="plain-text">{service.name}</span>
              </>
            )}
          </h1>
          {showsList && <p className="page-sub">{subLine(view.targets.length)}</p>}
        </div>
      </div>

      <AlertListBanners
        serviceId={serviceId}
        failed={view.state === 'could-not-load' || view.refreshFailed}
        fetching={view.fetching}
        alertsOff={showsList && service !== null && service.alerts_enabled === false}
        onRetry={view.refresh}
      />

      {view.state === 'loading' && (
        <>
          <p className="sr-only" role="status">
            Loading targets…
          </p>
          <ul className="target-list" aria-hidden="true">
            {SKELETON_ROWS.map((row) => (
              <li key={row} className="target">
                <span className="skeleton" style={{ width: 28, height: 28 }} />
                <div className="target__main">
                  <span className="skeleton" style={{ width: '40%' }} />
                  <span className="skeleton" style={{ width: '65%', marginTop: 6 }} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {view.state === 'empty' && (
        <div className="empty">
          <BellOff className="icon empty__icon" aria-hidden="true" />
          <h2 className="empty__title">No notification targets</h2>
          <p>No alerts will be sent for this service until you add an email address or a webhook.</p>
        </div>
      )}
      {view.state === 'list' && (
        <ul className="target-list" aria-label="Notification targets">
          {view.targets.map((target) => (
            <TargetRow
              key={target.id}
              target={target}
              asking={removal.askedId === target.id}
              removing={removing}
              removeRef={(button) => {
                if (button) removeButtons.current.set(target.id, button)
                else removeButtons.current.delete(target.id)
              }}
              onAsk={() => removal.ask(target.id)}
              onCancel={removal.cancel}
              onConfirm={confirm}
            />
          ))}
        </ul>
      )}
    </main>
  )
}
