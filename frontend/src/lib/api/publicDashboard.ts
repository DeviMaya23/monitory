import { apiRequest } from './request'
import type { components } from './schema'

export type PublicDashboard = components['schemas']['PublicDashboard']
export type PublicService = components['schemas']['PublicService']

/** `getPublicDashboard`: the services chosen for the public view, ordered by name. No sign-in. */
export function getPublicDashboard(): Promise<PublicDashboard> {
  return apiRequest<PublicDashboard>('GET', '/api/public/dashboard')
}
