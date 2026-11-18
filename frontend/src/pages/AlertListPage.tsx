import { useParams } from 'react-router'
import { AlertList } from '../features/alert-list/components/AlertList'
import { useRemoveTarget } from '../features/alert-list/hooks/useRemoveTarget'
import { useTargetList } from '../features/alert-list/hooks/useTargetList'
import { useServiceList } from '../features/service-list/hooks/useServiceList'

/**
 * The route entry for `/services/:serviceId/alerts`. The cached service list is only a source of the
 * service's name and alerts switch; its own loading or failure never shows here.
 */
export default function AlertListPage() {
  const { serviceId = '' } = useParams()
  const services = useServiceList()
  const view = useTargetList(serviceId)
  const removal = useRemoveTarget(serviceId)
  const service = services.services.find((candidate) => candidate.id === serviceId) ?? null
  return <AlertList serviceId={serviceId} service={service} view={view} removal={removal} />
}
