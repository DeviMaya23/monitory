import { describe, expect, it } from 'vitest'
import { FIELD_IDS, fieldId } from './fieldIds'
import { fieldLabel, summaryTitle } from './fieldLabels'

describe('fieldLabel', () => {
  it.each([
    ['name', 'Name'],
    ['check.method', 'Method'],
    ['check.url', 'URL'],
    ['unhealthy_message', 'Unhealthy message'],
    ['recovery_message', 'Recovery message'],
    ['settings.check_interval_seconds', 'Check interval'],
    ['settings.timeout_seconds', 'Timeout'],
    ['settings.retry_count', 'Retries'],
    ['settings.retry_interval_seconds', 'Retry interval'],
  ] as const)('maps %s to %s with its target', (path, label) => {
    expect(fieldLabel(path)).toEqual({ label, target: path })
  })

  it.each(['check.type', 'toString'])('maps %s to itself with no target', (path) => {
    expect(fieldLabel(path)).toEqual({ label: path, target: null })
  })
})

describe('fieldLabel of the Request group’s rows and body', () => {
  it.each([
    ['check.query_params[2].name', 'Query parameter 3 name'],
    ['check.query_params[0].value', 'Query parameter 1 value'],
    ['check.headers[0].value', 'Header 1 value'],
    ['check.headers[4].name', 'Header 5 name'],
    ['check.body.content', 'Body'],
  ] as const)('maps %s to %s with itself as the input', (path, label) => {
    expect(fieldLabel(path)).toEqual({ label, target: path })
  })

  it.each([
    ['check.query_params', 'Query parameters'],
    ['check.headers', 'Headers'],
    ['check.body.type', 'Body type'],
  ])('maps %s to %s with no input', (path, label) => {
    expect(fieldLabel(path)).toEqual({ label, target: null })
  })

  it('maps the id of each row input and the body text', () => {
    expect(fieldId('check.query_params[1].name')).toBe('service-query-1-name')
    expect(fieldId('check.headers[3].value')).toBe('service-header-3-value')
    expect(fieldId('check.body.content')).toBe('service-body-content')
    expect(fieldId('check.url')).toBe('service-url')
  })
})

describe('the bare settings path', () => {
  it('is the Timing group: labelled Timing, with no input', () => {
    expect(fieldLabel('settings')).toEqual({ label: 'Timing', target: null })
  })
})

describe('FIELD_IDS', () => {
  it('has a distinct id for every target, including the message text areas and the four timing inputs', () => {
    expect(FIELD_IDS.unhealthy_message).toBeTruthy()
    expect(FIELD_IDS.recovery_message).toBeTruthy()
    expect(FIELD_IDS['settings.timeout_seconds']).toBeTruthy()
    expect(new Set(Object.values(FIELD_IDS)).size).toBe(Object.keys(FIELD_IDS).length)
  })
})

describe('summaryTitle (FR-12)', () => {
  it('counts four fields', () => {
    expect(summaryTitle(4)).toBe('4 fields need fixing before this can be saved.')
  })

  it('is singular for one', () => {
    expect(summaryTitle(1)).toBe('1 field needs fixing before this can be saved.')
  })
})
