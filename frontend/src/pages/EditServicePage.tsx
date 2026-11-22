import { useParams } from 'react-router'
import { EditServiceForm } from '../features/service-form/components/EditServiceForm'
import { EditLoadFailed, EditLoading, EditNotFound } from '../features/service-form/components/EditLoadStates'
import { useService } from '../features/service-form/hooks/useService'

/** The route entry for `/services/:serviceId`: loads the service, then shows the form or the state that stands in for it. */
export default function EditServicePage() {
  const { serviceId = '' } = useParams()
  const view = useService(serviceId)
  switch (view.state) {
    case 'loading':
      return <EditLoading />
    case 'could-not-load':
      return <EditLoadFailed fetching={view.fetching} onRetry={view.refetch} />
    case 'not-found':
      return <EditNotFound />
    case 'session-ended':
      // The shell ends the session and replaces the page with the sign-in form.
      return null
    case 'loaded':
      return <EditServiceForm key={view.service.id} service={view.service} />
  }
}
