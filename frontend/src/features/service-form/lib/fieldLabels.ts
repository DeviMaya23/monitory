/** The server `field` paths that have an input on this screen. */
export type FieldTarget = 'name' | 'check.method' | 'check.url'

const LABELS: Record<FieldTarget, string> = {
  name: 'Name',
  'check.method': 'Method',
  'check.url': 'URL',
}

function isTarget(path: string): path is FieldTarget {
  return Object.hasOwn(LABELS, path)
}

/** The label of a server `field` path and the input it belongs to; a path with no input is its own label. */
export function fieldLabel(path: string): { label: string; target: FieldTarget | null } {
  return isTarget(path) ? { label: LABELS[path], target: path } : { label: path, target: null }
}

/** The title of the error summary for `count` errors. */
export function summaryTitle(count: number): string {
  return count === 1
    ? '1 field needs fixing before this can be saved.'
    : `${count} fields need fixing before this can be saved.`
}
