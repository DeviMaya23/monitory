import { createService, type Service } from '../../../lib/api/services'
import { toServiceInput } from '../lib/serviceInput'
import { useSaveService } from './useSaveService'

/** Sends `createService` (FR-6); on a 201 the cached service list is dropped, and `onCreated` runs if the form is still on screen. */
export function useCreateService(onCreated: (service: Service) => void) {
  return useSaveService('create', (values) => createService(toServiceInput(values)), onCreated)
}
