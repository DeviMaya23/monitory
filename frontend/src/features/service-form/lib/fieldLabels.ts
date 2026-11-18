/** The server `field` paths that have an input on this screen. */
export type FieldTarget =
  | 'name'
  | 'check.method'
  | 'check.url'
  | 'settings.check_interval_seconds'
  | 'settings.timeout_seconds'
  | 'settings.retry_count'
  | 'settings.retry_interval_seconds'
  | 'unhealthy_message'
  | 'recovery_message'

/** The bare `settings` path: the Timing group as a whole, with no input of its own. */
export const TIMING_GROUP_PATH = 'settings'
const TIMING_GROUP_LABEL = 'Timing'

const LABELS: Record<FieldTarget, string> = {
  name: 'Name',
  'check.method': 'Method',
  'check.url': 'URL',
  'settings.check_interval_seconds': 'Check interval',
  'settings.timeout_seconds': 'Timeout',
  'settings.retry_count': 'Retries',
  'settings.retry_interval_seconds': 'Retry interval',
  unhealthy_message: 'Unhealthy message',
  recovery_message: 'Recovery message',
}

function isTarget(path: string): path is FieldTarget {
  return Object.hasOwn(LABELS, path)
}

/** The label of a server `field` path and the input it belongs to; a path with no input is its own label. */
export function fieldLabel(path: string): {
  label: string
  target: FieldTarget | null
} {
  if (path === TIMING_GROUP_PATH) return { label: TIMING_GROUP_LABEL, target: null }
  return isTarget(path) ? { label: LABELS[path], target: path } : { label: path, target: null }
}

/** The title of the error summary for `count` errors. */
export function summaryTitle(count: number): string {
  return count === 1
    ? '1 field needs fixing before this can be saved.'
    : `${count} fields need fixing before this can be saved.`
}
