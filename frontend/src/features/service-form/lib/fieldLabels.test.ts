import { describe, expect, it } from 'vitest'
import { FIELD_IDS } from './fieldIds'
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

  it.each(['check.headers[2].value', 'toString'])('maps %s to itself with no target', (path) => {
    expect(fieldLabel(path)).toEqual({ label: path, target: null })
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
