import { afterEach, describe, expect, it } from 'vitest'
import { getPortalHost } from './portalHost'

afterEach(() => {
  document.querySelectorAll('[data-portal-host]').forEach((el) => el.remove())
})

describe('getPortalHost', () => {
  it('returns one element in body, with the app scope classes, however often it is called', () => {
    const first = getPortalHost()
    const second = getPortalHost()
    expect(second).toBe(first)
    expect(first.parentElement).toBe(document.body)
    expect(first).toHaveClass('app', 'portal-host')
    expect(first).toHaveAttribute('data-portal-host')
    expect(document.querySelectorAll('[data-portal-host]')).toHaveLength(1)
  })

  it('creates a new one when the element was removed from the document', () => {
    const first = getPortalHost()
    first.remove()
    const next = getPortalHost()
    expect(next).not.toBe(first)
    expect(next.isConnected).toBe(true)
    expect(document.querySelectorAll('[data-portal-host]')).toHaveLength(1)
  })
})
