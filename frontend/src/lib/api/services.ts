import { apiRequest } from './request'
import type { components } from './schema'

export type Service = components['schemas']['Service']
export type ServiceList = components['schemas']['ServiceList']
export type FailureReason = components['schemas']['FailureReason']
export type ServiceInput = components['schemas']['ServiceInput']
export type FieldError = components['schemas']['FieldError']
export type HttpMethod = components['schemas']['HttpCheck']['method']

/** The query key of the cached service list, shared by every feature that reads or drops it. */
export const servicesQueryKey = ['services'] as const

/** `listServices`: every service, at most 50, ordered by name ignoring case. */
export function listServices(): Promise<ServiceList> {
  return apiRequest<ServiceList>('GET', '/api/services')
}

/** `createService`: adds a service. Settings left out of `input` get the server's defaults. */
export function createService(input: ServiceInput): Promise<Service> {
  return apiRequest<Service>('POST', '/api/services', input)
}
