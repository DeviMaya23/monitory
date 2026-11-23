import { apiRequest } from './request'
import type { components } from './schema'

export type Service = components['schemas']['Service']
export type ServiceList = components['schemas']['ServiceList']
export type FailureReason = components['schemas']['FailureReason']
export type ServiceInput = components['schemas']['ServiceInput']
export type ServiceTestInput = components['schemas']['ServiceTestInput']
export type ServiceTestResult = components['schemas']['ServiceTestResult']
export type FieldError = components['schemas']['FieldError']
export type HttpMethod = components['schemas']['HttpCheck']['method']

/** The query key of the cached service list, shared by every feature that reads or drops it. */
export const servicesQueryKey = ['services'] as const

/** The query key of one service's cached detail; under the list's key, so `exact` matters when dropping the list. */
export const serviceQueryKey = (id: string) => ['services', id] as const

/** `listServices`: every service, at most 50, ordered by name ignoring case. */
export function listServices(): Promise<ServiceList> {
  return apiRequest<ServiceList>('GET', '/api/services')
}

/** `createService`: adds a service. Settings left out of `input` get the server's defaults. */
export function createService(input: ServiceInput): Promise<Service> {
  return apiRequest<Service>('POST', '/api/services', input)
}

/** `getService`: one service with every setting, header values in full. */
export function getService(id: string): Promise<Service> {
  return apiRequest<Service>('GET', `/api/services/${encodeURIComponent(id)}`)
}

/** `updateService`: replaces every editable setting of a service; its state is kept. */
export function updateService(id: string, input: ServiceInput): Promise<Service> {
  return apiRequest<Service>('PUT', `/api/services/${encodeURIComponent(id)}`, input)
}

/** `deleteService`: removes a service, its alert list and its state. Resolves when the server answers 204. */
export function deleteService(id: string): Promise<void> {
  return apiRequest<void>('DELETE', `/api/services/${encodeURIComponent(id)}`)
}

/** `pauseService`: stops the checks and alerts of a service. Resolves with the paused `Service`. */
export function pauseService(id: string): Promise<Service> {
  return apiRequest<Service>('POST', `/api/services/${encodeURIComponent(id)}/pause`)
}

/** `resumeService`: starts the checks again and runs one now. Resolves with the resumed `Service`. */
export function resumeService(id: string): Promise<Service> {
  return apiRequest<Service>('POST', `/api/services/${encodeURIComponent(id)}/resume`)
}

/** `testServiceCheck`: runs one attempt of a check with the given settings and saves nothing. */
export function testServiceCheck(input: ServiceTestInput): Promise<ServiceTestResult> {
  return apiRequest<ServiceTestResult>('POST', '/api/service-tests', input)
}
