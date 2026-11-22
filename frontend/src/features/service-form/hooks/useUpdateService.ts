import { updateService, type Service } from '../../../lib/api/services'
import { toServiceInput } from '../lib/serviceInput'
import { useSaveService } from './useSaveService'

/**
 * Sends `updateService` for a loaded service (FR-7). The body is the create body plus the saved
 * public-page flag, so saving never changes it (the form has no control for it).
 */
export function useUpdateService(service: Service, onSaved: (service: Service) => void) {
  return useSaveService(
    'update',
    (values) =>
      updateService(service.id, { ...toServiceInput(values), shown_on_public_view: service.shown_on_public_view ?? false }),
    onSaved,
  )
}
