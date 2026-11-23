import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RELOAD_LABEL,
  REQUEST_NOT_ACCEPTED_TEXT,
  REQUEST_NOT_ACCEPTED_TITLE,
  REQUEST_NOT_ACCEPTED_TOAST,
  csrfToast,
} from './requestNotAccepted'

afterEach(() => vi.unstubAllGlobals())

describe('the request-not-accepted words (NFR-8)', () => {
  it('are exactly what the admin reads', () => {
    expect(REQUEST_NOT_ACCEPTED_TITLE).toBe('The request wasn’t accepted.')
    expect(REQUEST_NOT_ACCEPTED_TEXT).toBe('Reload the page and try again.')
    expect(REQUEST_NOT_ACCEPTED_TOAST).toBe('The request wasn’t accepted. Reload and try again.')
    expect(RELOAD_LABEL).toBe('Reload')
  })

  it('csrfToast is an error toast whose Reload action reloads the page once', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const toast = csrfToast()
    expect(toast).toEqual({
      kind: 'error',
      message: 'The request wasn’t accepted. Reload and try again.',
      action: { label: 'Reload', onClick: expect.any(Function) },
    })
    expect(reload).not.toHaveBeenCalled()
    toast.action.onClick()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
