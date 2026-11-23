import { updateService, type Service } from '../../../lib/api/services'
import { toServiceInput } from '../lib/serviceInput'
import { useSaveService } from './useSaveService'

/** Sends `updateService` for a loaded service (FR-7). The body is the create body: every setting comes from the form. */
export function useUpdateService(service: Service, onSaved: (service: Service) => void) {
  return useSaveService('update', (values) => updateService(service.id, toServiceInput(values)), onSaved)
}
