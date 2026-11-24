import { describe, expect, it } from 'vitest'
import { formatWait } from './formatWait'

describe('formatWait', () => {
  it.each([
    [0, '0 s'],
    [1, '1 s'],
    [59, '59 s'],
    [60, '1 min 0 s'],
    [61, '1 min 1 s'],
    [292, '4 min 52 s'],
    [900, '15 min 0 s'],
    [3600, '60 min 0 s'],
  ])('formats %i seconds as %s', (seconds, text) => {
    expect(formatWait(seconds)).toBe(text)
  })
})
