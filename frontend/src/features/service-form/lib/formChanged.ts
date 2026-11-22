import type { ServiceFormValues } from './formValues'

/**
 * Whether the form differs from where it started. A deep comparison of every value as typed:
 * rows and rules in order, an empty row counts, `'14 '` is not `'14'`. The one definition of "changed".
 */
export function isFormChanged(current: ServiceFormValues, initial: ServiceFormValues): boolean {
  return !sameValue(current, initial)
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => sameValue(item, b[i]))
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...keys].every((key) => sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
  }
  return a === b
}
