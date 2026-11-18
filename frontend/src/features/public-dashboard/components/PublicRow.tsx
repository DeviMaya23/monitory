import { CircleCheck, CircleX } from 'lucide-react'
import type { PublicService } from '../../../lib/api/publicDashboard'
import { formatTime } from '../../../lib/formatTime'

/** Healthy or Unhealthy: icon, word and badge shape, never colour alone (FR-62, FR-112). */
function PublicStatus({ status }: { status: PublicService['status'] }) {
  return status === 'healthy' ? (
    <span className="status status--ok">
      <CircleCheck className="icon icon--sm" aria-hidden="true" />
      Healthy
    </span>
  ) : (
    <span className="status status--bad">
      <CircleX className="icon icon--sm" aria-hidden="true" />
      Unhealthy
    </span>
  )
}

/** One row of the public view: name, status and last check, and nothing else (FR-40, FR-63). The name is text (NFR-7). */
export function PublicRow({ service, now }: { service: PublicService; now: Date }) {
  return (
    <li className="pub-row">
      <span className="pub-row__name">{service.name}</span>
      <span className="pub-row__status">
        <PublicStatus status={service.status} />
      </span>
      <span className="pub-row__time">
        <span className="pub-row__time-label">Last checked</span>
        <time dateTime={service.last_checked_at}>{formatTime(service.last_checked_at, now)}</time>
      </span>
    </li>
  )
}
