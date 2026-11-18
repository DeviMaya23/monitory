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
  ] as const)('maps %s to %s with its target', (path, label) => {
    expect(fieldLabel(path)).toEqual({ label, target: path })
  })

  it.each(['settings', 'check.headers[2].value', 'toString'])('maps %s to itself with no target', (path) => {
    expect(fieldLabel(path)).toEqual({ label: path, target: null })
  })
})

describe('FIELD_IDS', () => {
  it('has a distinct id for every target, including the two message text areas', () => {
    expect(FIELD_IDS.unhealthy_message).toBeTruthy()
    expect(FIELD_IDS.recovery_message).toBeTruthy()
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
