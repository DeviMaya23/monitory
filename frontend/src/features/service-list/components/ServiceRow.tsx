import { Link } from 'react-router'
import { Bell, BellOff, CircleAlert, Eye, EyeOff, Pause, Pencil, Play, Trash2, TriangleAlert } from 'lucide-react'
import type { Service } from '../../../lib/api/services'
import { Tooltip } from '../../../components/ui/Tooltip'
import { failureReasonText } from '../../../lib/failureReason'
import { formatTime } from '../../../lib/formatTime'
import { StatusBadge } from './StatusBadge'

function Time({ iso, now }: { iso: string; now: Date }) {
  return (
    <time className="svc__time" dateTime={iso}>
      {formatTime(iso, now)}
    </time>
  )
}

/** One service, with its row actions (FR-9, FR-62, FR-8). Server text is rendered as text (NFR-7). */
export function ServiceRow({
  service,
  now,
  onDelete,
  onToggle,
  toggling,
}: {
  service: Service
  now: Date
  onDelete: (service: Service) => void
  onToggle: (service: Service) => void
  /** This row's pause or resume request is in flight. */
  toggling: boolean
}) {
  const { state } = service
  const reason = !service.paused && state.status === 'unhealthy' ? state.last_failure_reason : null
  const alertsOn = service.alerts_enabled ?? true
  const servicePath = `/services/${encodeURIComponent(service.id)}`
  const alertsPath = `${servicePath}/alerts`
  const shown = service.shown_on_public_view ?? false

  return (
    <li className={service.paused ? 'svc svc--paused' : 'svc'}>
      <div className="svc__status">
        <StatusBadge service={service} />
      </div>
      <div className="svc__main">
        <div className="svc__title">
          <Tooltip content={service.name}>
            <Link className="svc__name" to={servicePath}>
              {service.name}
            </Link>
          </Tooltip>
          <span className="chip">{service.check.type === 'tcp' ? 'TCP' : 'HTTP'}</span>
        </div>
        {reason && (
          <p className="svc__reason">
            <CircleAlert className="icon icon--sm" aria-hidden="true" />
            <span>{failureReasonText(reason)}</span>
          </p>
        )}
        {service.alert_delivery_failed && (
          <Link className="svc__delivery" to={alertsPath}>
            <TriangleAlert className="icon icon--sm" aria-hidden="true" />
            <span>Alert delivery failed – view alert list</span>
          </Link>
        )}
      </div>
      <div className="svc__cell svc__check">
        <span className="svc__label">Last check</span>
        {state.last_checked_at ? (
          <Time iso={state.last_checked_at} now={now} />
        ) : (
          <span className="svc__never">Never</span>
        )}
      </div>
      <div className="svc__cell svc__change">
        <span className="svc__label">Last change</span>
        {state.last_status_change_at ? (
          <Time iso={state.last_status_change_at} now={now} />
        ) : (
          <span className="svc__never" aria-label="None">
            —
          </span>
        )}
      </div>
      <div className="svc__flags">
        <span className="svc__alerts">
          <span className={alertsOn ? 'flag flag--on' : 'flag flag--off'}>
            {alertsOn ? (
              <Bell className="icon icon--sm" aria-hidden="true" />
            ) : (
              <BellOff className="icon icon--sm" aria-hidden="true" />
            )}
            <span>{alertsOn ? 'On' : 'Off'}</span>
            <span className="sr-only"> alerts</span>
          </span>
        </span>
        <span className="svc__public">
          {service.paused ? (
            <span className="flag flag--off">
              <EyeOff className="icon icon--sm" aria-hidden="true" />
              <span>Paused</span>
              <span className="sr-only">, hidden from public page</span>
            </span>
          ) : (
            <span className={shown ? 'flag flag--on' : 'flag flag--off'}>
              {shown ? (
                <Eye className="icon icon--sm" aria-hidden="true" />
              ) : (
                <EyeOff className="icon icon--sm" aria-hidden="true" />
              )}
              <span>{shown ? 'Shown' : 'Hidden'}</span>
              <span className="sr-only">{shown ? ' on public page' : ' from public page'}</span>
            </span>
          )}
        </span>
      </div>
      <div className="svc__actions">
        {/* aria-disabled, not disabled, so the button keeps focus while the request is in flight. */}
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          aria-label={`${service.paused ? 'Resume' : 'Pause'} ${service.name}`}
          aria-disabled={toggling ? 'true' : undefined}
          onClick={() => {
            if (!toggling) onToggle(service)
          }}
        >
          {service.paused ? (
            <Play className="icon icon--sm" aria-hidden="true" />
          ) : (
            <Pause className="icon icon--sm" aria-hidden="true" />
          )}
          <span className="btn__label" aria-hidden="true">
            {service.paused ? 'Resume' : 'Pause'}
          </span>
        </button>
        <Link className="btn btn--ghost btn--icon" to={alertsPath} aria-label={`Alerts ${service.name}`}>
          <Bell className="icon icon--sm" aria-hidden="true" />
          <span className="btn__label" aria-hidden="true">
            Alerts
          </span>
        </Link>
        <Link className="btn btn--ghost btn--icon" to={servicePath} aria-label={`Edit ${service.name}`}>
          <Pencil className="icon icon--sm" aria-hidden="true" />
          <span className="btn__label" aria-hidden="true">
            Edit
          </span>
        </Link>
        <button
          type="button"
          className="btn btn--ghost-danger btn--icon"
          aria-label={`Delete ${service.name}`}
          onClick={() => onDelete(service)}
        >
          <Trash2 className="icon icon--sm" aria-hidden="true" />
          <span className="btn__label" aria-hidden="true">
            Delete
          </span>
        </button>
      </div>
    </li>
  )
}
