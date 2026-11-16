import { CircleCheck, CircleDashed, CirclePause, CircleX } from 'lucide-react'
import type { Service } from '../../../lib/api/services'

/** The status of a row: icon, word and badge shape, never colour alone (FR-62, FR-112). */
export function StatusBadge({ service }: { service: Service }) {
  if (service.paused) {
    return (
      <span className="status status--paused">
        <CirclePause className="icon icon--sm" aria-hidden="true" />
        Paused
      </span>
    )
  }
  switch (service.state.status) {
    case 'healthy':
      return (
        <span className="status status--ok">
          <CircleCheck className="icon icon--sm" aria-hidden="true" />
          Healthy
        </span>
      )
    case 'unhealthy':
      return (
        <span className="status status--bad">
          <CircleX className="icon icon--sm" aria-hidden="true" />
          Unhealthy
        </span>
      )
    default:
      return (
        <span className="status status--unchecked">
          <CircleDashed className="icon icon--sm" aria-hidden="true" />
          Not checked yet
        </span>
      )
  }
}
