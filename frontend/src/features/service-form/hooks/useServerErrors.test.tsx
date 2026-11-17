import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FieldError } from '../../../lib/api/services'
import { fieldError } from '../../../test/fixtures'
import { useServerErrors } from './useServerErrors'

function setup(errors: readonly FieldError[] | null) {
  return renderHook((props: { errors: readonly FieldError[] | null }) => useServerErrors(props.errors), {
    initialProps: { errors },
  })
}

const THREE = [
  fieldError('name', 'Name is too long here.', 'too_long'),
  fieldError('check.url', 'URL needs a scheme.', 'invalid_format'),
  fieldError('check.method', 'Method is not allowed.'),
]

describe('useServerErrors', () => {
  it('has nothing without a response', () => {
    const { result } = setup(null)
    expect(result.current.entries).toEqual([])
    expect(result.current.count).toBe(0)
    expect(result.current.errorFor('name')).toBeNull()
  })

  it('gives the error of check.url to the URL field and not to the others', () => {
    const { result } = setup([fieldError('check.url', 'URL needs a scheme.')])
    expect(result.current.errorFor('check.url')).toBe('URL needs a scheme.')
    expect(result.current.errorFor('name')).toBeNull()
    expect(result.current.errorFor('check.method')).toBeNull()
  })

  it('lists the entries in the order sent, with labels and targets', () => {
    const { result } = setup(THREE)
    expect(result.current.count).toBe(3)
    expect(result.current.entries.map(({ label, message, target }) => ({ label, message, target }))).toEqual([
      { label: 'Name', message: 'Name is too long here.', target: 'name' },
      { label: 'URL', message: 'URL needs a scheme.', target: 'check.url' },
      { label: 'Method', message: 'Method is not allowed.', target: 'check.method' },
    ])
  })

  it('clearing a field removes only its error and its entry, and the count follows', () => {
    const { result } = setup(THREE)
    act(() => result.current.clearField('check.url'))
    expect(result.current.errorFor('check.url')).toBeNull()
    expect(result.current.errorFor('name')).toBe('Name is too long here.')
    expect(result.current.errorFor('check.method')).toBe('Method is not allowed.')
    expect(result.current.entries.map((entry) => entry.label)).toEqual(['Name', 'Method'])
    expect(result.current.count).toBe(2)
  })

  it('clearing the last one empties the summary', () => {
    const { result } = setup(THREE)
    act(() => result.current.clearField('check.url'))
    act(() => result.current.clearField('name'))
    expect(result.current.count).toBe(1)
    act(() => result.current.clearField('check.method'))
    expect(result.current.entries).toEqual([])
    expect(result.current.count).toBe(0)
  })

  it('keeps the first of two errors for one path on the field and both in the summary', () => {
    const { result } = setup([fieldError('name', 'First.'), fieldError('name', 'Second.')])
    expect(result.current.errorFor('name')).toBe('First.')
    expect(result.current.entries.map((entry) => entry.message)).toEqual(['First.', 'Second.'])
    expect(result.current.count).toBe(2)
    act(() => result.current.clearField('name'))
    expect(result.current.count).toBe(0)
  })

  it('lists a path with no field in the summary with no target, and editing does not remove it', () => {
    const { result } = setup([fieldError('settings', 'The timing does not fit.'), fieldError('name', 'Needed.')])
    expect(result.current.entries[0]).toMatchObject({
      label: 'settings',
      message: 'The timing does not fit.',
      target: null,
    })
    act(() => result.current.clearField('name'))
    expect(result.current.entries.map((entry) => entry.label)).toEqual(['settings'])
    expect(result.current.count).toBe(1)
  })

  it('a new response starts with nothing cleared, even with the same errors', () => {
    const { result, rerender } = setup(THREE)
    act(() => result.current.clearField('name'))
    expect(result.current.count).toBe(2)
    rerender({ errors: [...THREE] })
    expect(result.current.count).toBe(3)
    expect(result.current.errorFor('name')).toBe('Name is too long here.')
    rerender({ errors: null })
    expect(result.current.count).toBe(0)
  })
})
