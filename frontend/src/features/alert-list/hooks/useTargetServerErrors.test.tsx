import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FieldError } from '../../../lib/api/services'
import { fieldError } from '../../../test/fixtures'
import { useTargetServerErrors } from './useTargetServerErrors'

function setup(errors: readonly FieldError[] | null) {
  return renderHook((props: { errors: readonly FieldError[] | null }) => useTargetServerErrors(props.errors), {
    initialProps: { errors },
  })
}

const MIXED = [
  fieldError('address', 'Not an address.'),
  fieldError('headers', 'Too many rows.', 'too_many'),
  fieldError('headers[0].name', 'Name is empty.'),
  fieldError('headers[1].value', 'Value too long.'),
  fieldError('type', 'Bad type.'),
]

describe('useTargetServerErrors', () => {
  it('has nothing without a response', () => {
    const { result } = setup(null)
    expect(result.current.entries).toEqual([])
    expect(result.current.count).toBe(0)
    expect(result.current.errorFor('name')).toBeNull()
  })

  it('lists the entries in the order sent with labels and inputs', () => {
    const { result } = setup(MIXED)
    expect(result.current.entries.map(({ label, message, inputId }) => ({ label, message, linked: inputId !== null }))).toEqual([
      { label: 'Email address', message: 'Not an address.', linked: true },
      { label: 'Custom headers', message: 'Too many rows.', linked: false },
      { label: 'Header 1 name', message: 'Name is empty.', linked: true },
      { label: 'Header 2 value', message: 'Value too long.', linked: true },
      { label: 'type', message: 'Bad type.', linked: false },
    ])
  })

  it('errorFor returns the first message of a path', () => {
    const { result } = setup([fieldError('url', 'First.'), fieldError('url', 'Second.')])
    expect(result.current.errorFor('url')).toBe('First.')
  })

  it('clearField removes that field’s error and entry only', () => {
    const { result } = setup(MIXED)
    act(() => result.current.clearField('address'))
    expect(result.current.errorFor('address')).toBeNull()
    expect(result.current.count).toBe(4)
    expect(result.current.errorFor('headers[0].name')).toBe('Name is empty.')
  })

  it('clearField("headers") removes the bare headers error and leaves the row ones', () => {
    const { result } = setup(MIXED)
    act(() => result.current.clearField('headers'))
    expect(result.current.errorFor('headers')).toBeNull()
    expect(result.current.errorFor('headers[0].name')).toBe('Name is empty.')
    expect(result.current.errorFor('headers[1].value')).toBe('Value too long.')
    expect(result.current.count).toBe(4)
  })

  it('clearHeaders removes the bare entry and every headers[…] entry, and nothing else', () => {
    const { result } = setup(MIXED)
    act(() => result.current.clearHeaders())
    expect(result.current.entries.map((entry) => entry.field)).toEqual(['address', 'type'])
  })

  it('a new response starts with nothing cleared', () => {
    const { result, rerender } = setup(MIXED)
    act(() => result.current.clearField('address'))
    act(() => result.current.clearHeaders())
    const next = [fieldError('address', 'Still wrong.'), fieldError('headers[0].name', 'Empty again.')]
    rerender({ errors: next })
    expect(result.current.count).toBe(2)
    expect(result.current.errorFor('address')).toBe('Still wrong.')
  })
})
