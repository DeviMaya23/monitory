import { describe, expect, it } from 'vitest'
import { ADD_DEFAULT_VALUES, type ServiceFormValues } from './formValues'
import { isFormChanged } from './formChanged'
import { toFormValues } from './serviceInput'
import { makeRichService } from '../../../test/fixtures'

const initial = toFormValues(makeRichService())
const with_ = (change: Partial<ServiceFormValues>): ServiceFormValues => ({ ...initial, ...change })

describe('isFormChanged', () => {
  it('is false for equal values (a copy, not the same object)', () => {
    expect(isFormChanged(structuredClone(initial), initial)).toBe(false)
  })

  it.each<[string, Partial<ServiceFormValues>]>([
    ['the name', { name: 'Other' }],
    ['the type', { type: 'tcp' }],
    ['the URL', { url: 'https://other.example.com' }],
    ['the method', { method: 'GET' }],
    ['a query row edited', { query_params: [{ name: 'region', value: 'us' }] }],
    ['a header row edited', { headers: [initial.headers[0], { name: 'X-Trace', value: 'off' }] }],
    ['a header row removed', { headers: [initial.headers[0]] }],
    ['an empty header row added', { headers: [...initial.headers, { name: '', value: '' }] }],
    ['a rule edited', { json_rules: [{ field: 'x', kind: 'text', text: 'down' }, initial.json_rules[1]] }],
    ['a rule kind', { json_rules: [initial.json_rules[0], { field: 'maintenance', kind: 'true', text: '' }] }],
    ['the rule mode', { json_rule_mode: 'any' }],
    ['the days with a trailing space', { cert_days: '30 ' }],
    ['a timing text', { timeout: '8' }],
    ['the alerts switch', { alerts_enabled: true }],
    ['a message', { recovery_message: 'Back' }],
    ['a host', { host: 'db' }],
    ['a port', { port: '5432' }],
  ])('is true for a changed %s, and false again when put back', (_label, change) => {
    const changed = with_(change)
    expect(isFormChanged(changed, initial)).toBe(true)
    expect(isFormChanged(initial, initial)).toBe(false)
  })

  it('is false once a row added and removed again, and once the type is switched back', () => {
    const added = with_({ headers: [...initial.headers, { name: '', value: '' }], type: 'tcp' })
    expect(isFormChanged(added, initial)).toBe(true)
    expect(isFormChanged(with_({ headers: [...added.headers.slice(0, 2)], type: 'http' }), initial)).toBe(false)
  })

  it('treats the add defaults against themselves as unchanged and a typed name as changed', () => {
    expect(isFormChanged({ ...ADD_DEFAULT_VALUES }, ADD_DEFAULT_VALUES)).toBe(false)
    expect(isFormChanged({ ...ADD_DEFAULT_VALUES, name: 'a' }, ADD_DEFAULT_VALUES)).toBe(true)
  })
})
