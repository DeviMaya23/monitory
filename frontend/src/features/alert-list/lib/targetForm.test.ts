import { describe, expect, it } from 'vitest'
import { makeEmailTarget, makeWebhookTarget } from '../../../test/fixtures'
import { EMPTY_VALUES, sameValues, toInput, usesPlainHttp, valuesOf } from './targetForm'

describe('toInput', () => {
  it('sends only the email fields, with the name as typed', () => {
    expect(toInput({ ...EMPTY_VALUES, name: '', address: 'a@b.c', url: 'https://kept', headers: [{ name: 'x', value: 'y' }] })).toEqual({
      type: 'email',
      name: '',
      address: 'a@b.c',
    })
  })

  it('sends only the webhook fields and the rows in order, an empty row included', () => {
    expect(
      toInput({ name: ' n ', type: 'webhook', address: 'kept@x.y', url: 'http://h', headers: [{ name: '', value: '' }, { name: 'B', value: 'v' }] }),
    ).toEqual({ type: 'webhook', name: ' n ', url: 'http://h', headers: [{ name: '', value: '' }, { name: 'B', value: 'v' }] })
    expect(toInput({ ...EMPTY_VALUES, type: 'webhook', url: 'u' })).toEqual({ type: 'webhook', name: '', url: 'u', headers: [] })
  })
})

describe('valuesOf', () => {
  it('fills the target’s own fields, a missing name as empty, and leaves the other type empty', () => {
    expect(valuesOf(makeEmailTarget({ name: undefined, address: 'a@b.c' }))).toEqual({ ...EMPTY_VALUES, address: 'a@b.c' })
    expect(valuesOf(makeWebhookTarget({ name: 'N', url: 'https://h', headers: [{ name: 'A', value: 'b' }] }))).toEqual({
      name: 'N',
      type: 'webhook',
      address: '',
      url: 'https://h',
      headers: [{ name: 'A', value: 'b' }],
    })
  })
})

describe('usesPlainHttp', () => {
  it.each([
    ['http://x', true],
    ['  HTTP://x', true],
    ['https://x', false],
    ['http:/', false],
    ['', false],
  ])('%j → %s', (url, expected) => {
    expect(usesPlainHttp(url)).toBe(expected)
  })
})

describe('sameValues', () => {
  it('compares every field including the inactive type’s and the rows', () => {
    expect(sameValues(EMPTY_VALUES, { ...EMPTY_VALUES })).toBe(true)
    expect(sameValues(EMPTY_VALUES, { ...EMPTY_VALUES, url: 'x' })).toBe(false)
    expect(sameValues(EMPTY_VALUES, { ...EMPTY_VALUES, headers: [{ name: '', value: '' }] })).toBe(false)
  })
})
