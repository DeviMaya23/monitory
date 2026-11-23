import { afterEach, describe, expect, it, vi } from 'vitest'
import { problem } from '../../../test/fixtures'
import { GONE_MESSAGE, goneToast, toOutcome, type Outcome } from './rowActionToasts'

describe('toOutcome', () => {
  it.each<[string, unknown, Outcome]>([
    ['401 unauthenticated', problem(401, 'unauthenticated'), 'unauthenticated'],
    ['404 not_found', problem(404, 'not_found'), 'gone'],
    ['403 csrf_failed', problem(403, 'csrf_failed'), 'csrf'],
    ['403 with another code', problem(403, 'not_found'), 'failed'],
    ['404 with another code', problem(404, 'unauthenticated'), 'failed'],
    ['401 with another code', problem(401, 'not_found'), 'failed'],
    ['a 500', problem(500, 'internal_error'), 'failed'],
    ['a 500 with csrf_failed', problem(500, 'csrf_failed'), 'failed'],
    ['a 404 with csrf_failed', problem(404, 'csrf_failed'), 'failed'],
    ['a plain Error', new Error('boom'), 'failed'],
    ['a string', 'csrf_failed', 'failed'],
    ['undefined', undefined, 'failed'],
  ])('%s gives %s', (_name, error, outcome) => {
    expect(toOutcome(error)).toBe(outcome)
  })
})

describe('row action toasts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('the texts are exactly what the admin reads today', () => {
    expect(GONE_MESSAGE).toBe('That service was already deleted.')
  })

  it('the gone toast is an error with the gone text and no action', () => {
    expect(goneToast()).toEqual({ kind: 'error', message: 'That service was already deleted.' })
  })
})
