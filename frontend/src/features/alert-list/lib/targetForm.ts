import type { Target, TargetInput } from '../../../lib/api/targets'

export type HeaderRow = { name: string; value: string }

/** What the form holds: the values of both types, of which only the chosen one is sent. */
export type TargetFormValues = {
  name: string
  type: 'email' | 'webhook'
  address: string
  url: string
  headers: HeaderRow[]
}

/** The values a new target's form opens with. */
export const EMPTY_VALUES: TargetFormValues = { name: '', type: 'email', address: '', url: '', headers: [] }

/** The values an edit form opens with: the target's, and empty ones for the other type. */
export function valuesOf(target: Target): TargetFormValues {
  const name = target.name ?? ''
  if (target.type === 'email') return { ...EMPTY_VALUES, name, address: target.address }
  return {
    ...EMPTY_VALUES,
    name,
    type: 'webhook',
    url: target.url,
    headers: (target.headers ?? []).map(({ name: headerName, value }) => ({ name: headerName, value })),
  }
}

/** The request body: as typed, with the fields of the chosen type only. `name` is always sent. */
export function toInput(values: TargetFormValues): TargetInput {
  if (values.type === 'email') return { type: 'email', name: values.name, address: values.address }
  return {
    type: 'webhook',
    name: values.name,
    url: values.url,
    headers: values.headers.map(({ name, value }) => ({ name, value })),
  }
}

/** Whether the typed URL warns about plain HTTP (FR-100): after leading spaces, ignoring case. */
export function usesPlainHttp(url: string): boolean {
  return /^\s*http:\/\//i.test(url)
}

/** Whether two sets of values are the same, in every field of both types. */
export function sameValues(a: TargetFormValues, b: TargetFormValues): boolean {
  return (
    a.name === b.name &&
    a.type === b.type &&
    a.address === b.address &&
    a.url === b.url &&
    a.headers.length === b.headers.length &&
    a.headers.every((row, i) => row.name === b.headers[i].name && row.value === b.headers[i].value)
  )
}
