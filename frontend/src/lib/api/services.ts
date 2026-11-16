import { apiRequest } from './request'
import type { components } from './schema'

export type Service = components['schemas']['Service']
export type ServiceList = components['schemas']['ServiceList']
export type FailureReason = components['schemas']['FailureReason']

/** `listServices`: every service, at most 50, ordered by name ignoring case. */
export function listServices(): Promise<ServiceList> {
  return apiRequest<ServiceList>('GET', '/api/services')
}
