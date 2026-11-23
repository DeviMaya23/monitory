import { apiRequest } from './request'
import type { components } from './schema'

export type PublicViewSettings = components['schemas']['PublicViewSettings']

/** The query key of the cached public view setting. Outside `['services']`, so saving a service does not drop it. */
export const publicViewQueryKey = ['public-view-settings'] as const

/** `getPublicViewSettings`: whether the public view is on. */
export function getPublicViewSettings(): Promise<PublicViewSettings> {
  return apiRequest<PublicViewSettings>('GET', '/api/settings/public-view')
}

/** `updatePublicViewSettings`: turns the public view on or off. Resolves with the saved setting. */
export function updatePublicViewSettings(input: PublicViewSettings): Promise<PublicViewSettings> {
  return apiRequest<PublicViewSettings>('PUT', '/api/settings/public-view', input)
}
