import { describe, expect, it } from 'vitest'
import { longestAttempt, readTiming, readWholeNumber, TIMING_DEFAULTS } from './timingGroup'

describe('TIMING_DEFAULTS (FR-57)', () => {
  it('are 60, 10, 2 and 10', () => {
    expect(TIMING_DEFAULTS).toEqual({
      check_interval: '60',
      timeout: '10',
      retries: '2',
      retry_interval: '10',
    })
  })
})

describe('readWholeNumber', () => {
  it.each([
    ['0', 0],
    ['60', 60],
    [' 12 ', 12],
    ['007', 7],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])('reads %j as %d', (text, value) => {
    expect(readWholeNumber(text)).toBe(value)
  })

  it.each([
    '',
    ' ',
    '-1',
    '1.5',
    '1e3',
    'abc',
    '+5',
    '1 2',
    String(Number.MAX_SAFE_INTEGER) + '0',
    '99999999999999999999',
  ])('does not read %j', (text) => {
    expect(readWholeNumber(text)).toBeNull()
  })
})

describe('readTiming', () => {
  it('reads all four, and is null when any one is not a whole number', () => {
    expect(readTiming(TIMING_DEFAULTS)).toEqual({
      interval: 60,
      timeout: 10,
      retries: 2,
      retryInterval: 10,
    })
    expect(readTiming({ ...TIMING_DEFAULTS, retries: 'x' })).toBeNull()
  })
})

describe('longestAttempt (FR-56)', () => {
  it('is 50 and fits for 60 / 10 / 2 / 10', () => {
    expect(longestAttempt(10, 2, 10, 60)).toEqual({ seconds: 50, fits: true })
  })

  it('is 70 and exceeds for interval 30, timeout 10, retries 3, retry interval 10', () => {
    expect(longestAttempt(10, 3, 10, 30)).toEqual({ seconds: 70, fits: false })
  })

  it('fits when it equals the interval, and exceeds one second less', () => {
    expect(longestAttempt(10, 2, 10, 50)).toEqual({ seconds: 50, fits: true })
    expect(longestAttempt(10, 2, 10, 49)).toEqual({ seconds: 50, fits: false })
  })

  it('is the timeout alone with zero retries', () => {
    expect(longestAttempt(10, 0, 10, 60)).toEqual({ seconds: 10, fits: true })
  })

  it('is null when the result is not a safe integer', () => {
    expect(longestAttempt(Number.MAX_SAFE_INTEGER, 1, 0, 60)).toBeNull()
  })
})
