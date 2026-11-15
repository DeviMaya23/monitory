import { apiRequest } from './request'
import type { components } from './schema'

type Health = components['schemas']['Health']

/** `getHealth`: says only that the app is running (FR-96). */
export function getHealth(): Promise<Health> {
  return apiRequest<Health>('GET', '/health')
}
