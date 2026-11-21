import type { ServiceInput } from '../../../lib/api/services'

/** The two kinds of service (FR-33). */
export type ServiceType = 'http' | 'tcp'

/** The type a new service starts with. */
export const DEFAULT_SERVICE_TYPE: ServiceType = 'http'

export const TYPE_OPTIONS: readonly { value: ServiceType; text: string }[] = [
  { value: 'http', text: 'HTTP(S)' },
  { value: 'tcp', text: 'TCP port' },
]

export const TYPE_TEXT = {
  label: 'Type',
  hint: 'Changing type swaps the fields below.',
} as const

export const TCP_TEXT = {
  legend: 'TCP port',
  hostLabel: 'Host',
  hostPlaceholder: 'db.internal or 10.0.0.12',
  portLabel: 'Port',
  portPlaceholder: '5432',
  portHint: '1 to 65535',
} as const

export const TYPE_ID = 'service-type'
export const TYPE_HINT_ID = 'service-type-hint'
export const HOST_ID = 'service-host'
export const PORT_ID = 'service-port'
export const PORT_HINT_ID = 'service-port-hint'

export const HOST_PATH = 'check.host'
export const PORT_PATH = 'check.port'
export const TYPE_PATH = 'check.type'

/** Every server path under `check` starts with this. */
export const CHECK_PREFIX = 'check.'

type CheckInput = ServiceInput['check']

/** The TCP check: the host as typed (the server trims it) and the port as an integer. */
export function tcpCheck(host: string, port: number): Extract<CheckInput, { type: 'tcp' }> {
  return { type: 'tcp', host, port }
}
