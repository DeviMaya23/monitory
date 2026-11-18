import { apiRequest } from './request'
import type { components } from './schema'

export type Target = components['schemas']['Target']
export type EmailTarget = components['schemas']['EmailTarget']
export type WebhookTarget = components['schemas']['WebhookTarget']
export type TargetList = components['schemas']['TargetList']
export type TargetInput = components['schemas']['TargetInput']
export type TargetTestResult = components['schemas']['TargetTestResult']

/**
 * The query key of one service's cached alert list. It does not start with `'services'`, so a refresh
 * or removal of the service list never touches it.
 */
export function targetsQueryKey(serviceId: string) {
  return ['alert-targets', serviceId] as const
}

/** `listTargets`: a service's notification targets, at most 5, in the order added. */
export function listTargets(serviceId: string): Promise<TargetList> {
  return apiRequest<TargetList>('GET', `/api/services/${encodeURIComponent(serviceId)}/targets`)
}

/** `deleteTarget`: removes one target from a service's alert list. Resolves when the server answers 204. */
export function deleteTarget(serviceId: string, targetId: string): Promise<void> {
  return apiRequest<void>(
    'DELETE',
    `/api/services/${encodeURIComponent(serviceId)}/targets/${encodeURIComponent(targetId)}`,
  )
}

/** `createTarget`: adds a target to a service's alert list; resolves with the saved target (201). */
export function createTarget(serviceId: string, input: TargetInput): Promise<Target> {
  return apiRequest<Target>('POST', `/api/services/${encodeURIComponent(serviceId)}/targets`, input)
}

/** `updateTarget`: replaces a target's editable fields; resolves with the saved target (200). */
export function updateTarget(serviceId: string, targetId: string, input: TargetInput): Promise<Target> {
  return apiRequest<Target>(
    'PUT',
    `/api/services/${encodeURIComponent(serviceId)}/targets/${encodeURIComponent(targetId)}`,
    input,
  )
}

/** `testTarget`: sends one test alert with the given settings and saves nothing. Delivered or failed, the answer is a 200. */
export function testTarget(serviceId: string, input: TargetInput): Promise<TargetTestResult> {
  return apiRequest<TargetTestResult>('POST', `/api/services/${encodeURIComponent(serviceId)}/target-tests`, input)
}
