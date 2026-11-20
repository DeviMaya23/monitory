import {
  BODY_CONTENT_PATH,
  BODY_TEXT,
  BODY_TYPE_PATH,
  parseRowPath,
  ROW_LISTS,
  rowLabel,
  type RowPart,
} from './requestRows'

/** The paths of a row's input: the index is part of the path. */
export type RowTarget = `check.query_params[${number}].${RowPart}` | `check.headers[${number}].${RowPart}`

/** The paths of the Request group that name a list or the body type as a whole: no input of their own. */
export type BarePath = 'check.query_params' | 'check.headers' | typeof BODY_TYPE_PATH

/** The server `field` paths that have an input on this screen. */
export type FieldTarget = StaticTarget | RowTarget | typeof BODY_CONTENT_PATH

export type StaticTarget =
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

const LABELS: Record<StaticTarget, string> = {
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

/** The labels of the paths with no input of their own, in the summary. */
const BARE_LABELS: Record<BarePath, string> = {
  'check.query_params': ROW_LISTS.query_params.legend,
  'check.headers': ROW_LISTS.headers.legend,
  [BODY_TYPE_PATH]: BODY_TEXT.typeLabel,
}

function isStatic(path: string): path is StaticTarget {
  return Object.hasOwn(LABELS, path)
}

/** Whether the path is a list's own or the body type's. */
export function isBarePath(path: string): path is BarePath {
  return Object.hasOwn(BARE_LABELS, path)
}

/** The label of a server `field` path and the input it belongs to; a path with no input is its own label. */
export function fieldLabel(path: string): {
  label: string
  target: FieldTarget | null
} {
  if (path === TIMING_GROUP_PATH) return { label: TIMING_GROUP_LABEL, target: null }
  if (isStatic(path)) return { label: LABELS[path], target: path }
  if (path === BODY_CONTENT_PATH) return { label: BODY_TEXT.contentLabel, target: path }
  const row = parseRowPath(path)
  if (row !== null)
    return {
      label: rowLabel(row.list, row.index, row.part),
      target: path as RowTarget,
    }
  if (isBarePath(path)) return { label: BARE_LABELS[path], target: null }
  return { label: path, target: null }
}

/** The title of the error summary for `count` errors. */
export function summaryTitle(count: number): string {
  return count === 1
    ? '1 field needs fixing before this can be saved.'
    : `${count} fields need fixing before this can be saved.`
}
