import { ServiceList } from '../features/service-list/components/ServiceList'
import { useServiceList } from '../features/service-list/hooks/useServiceList'

/** The route entry for `/`: the admin's service list. */
export default function DashboardPage() {
  return <ServiceList view={useServiceList()} />
}
