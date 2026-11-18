import { PublicDashboard } from '../features/public-dashboard/components/PublicDashboard'
import { usePublicDashboard } from '../features/public-dashboard/hooks/usePublicDashboard'

/** The route entry for `/status`: the anonymous public view. */
export default function PublicDashboardPage() {
  return <PublicDashboard view={usePublicDashboard()} />
}
