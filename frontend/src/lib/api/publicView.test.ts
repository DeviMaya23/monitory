import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPublicViewSettings, updatePublicViewSettings } from './publicView'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify({ enabled: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ),
  )
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

describe('public view settings', () => {
  it('getPublicViewSettings sends GET /api/settings/public-view with no body (FR-26)', async () => {
    await expect(getPublicViewSettings()).resolves.toEqual({ enabled: true })
    const [path, init] = fetchMock.mock.calls[0]
    expect(path).toBe('/api/settings/public-view')
    expect(init?.method).toBe('GET')
    expect(init?.body).toBeUndefined()
  })

  it('updatePublicViewSettings sends PUT with the body {"enabled":true} (FR-26)', async () => {
    await expect(updatePublicViewSettings({ enabled: true })).resolves.toEqual({ enabled: true })
    const [path, init] = fetchMock.mock.calls[0]
    expect(path).toBe('/api/settings/public-view')
    expect(init?.method).toBe('PUT')
    expect(init?.body).toBe('{"enabled":true}')
  })
})
