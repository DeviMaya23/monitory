import { describe, expect, it } from 'vitest'
import { summaryTitle } from './summaryTitle'

describe('summaryTitle (FR-12)', () => {
  it('is singular for one', () => {
    expect(summaryTitle(1)).toBe('1 field needs fixing before this can be saved.')
  })

  it('counts three fields', () => {
    expect(summaryTitle(3)).toBe('3 fields need fixing before this can be saved.')
  })

  it('counts four fields', () => {
    expect(summaryTitle(4)).toBe('4 fields need fixing before this can be saved.')
  })
})
