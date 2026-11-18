import { beforeEach, describe, expect, it, vi } from 'vitest'
import { problem } from '../../test/fixtures'
import { apiRequest } from './request'
import { deleteTarget, listTargets, targetsQueryKey } from './targets'
import { servicesQueryKey } from './services'

vi.mock('./request', () => ({ apiRequest: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('listTargets', () => {
  it('calls GET once and returns the value', async () => {
    const list = [] as never[]
    vi.mocked(apiRequest).mockResolvedValue(list)
    await expect(listTargets('abc')).resolves.toBe(list)
    expect(apiRequest).toHaveBeenCalledOnce()
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/services/abc/targets')
  })

  it('encodes the service id', async () => {
    vi.mocked(apiRequest).mockResolvedValue([])
    await listTargets('a b/c')
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/services/a%20b%2Fc/targets')
  })

  it('lets a rejection reach the caller unchanged (NFR-8)', async () => {
    const error = problem(500, 'internal_error')
    vi.mocked(apiRequest).mockRejectedValue(error)
    await expect(listTargets('abc')).rejects.toBe(error)
  })
})

describe('deleteTarget', () => {
  it('calls DELETE and resolves to undefined', async () => {
    vi.mocked(apiRequest).mockResolvedValue(undefined)
    await expect(deleteTarget('abc', 't1')).resolves.toBeUndefined()
    expect(apiRequest).toHaveBeenCalledWith('DELETE', '/api/services/abc/targets/t1')
  })

  it('encodes both ids', async () => {
    vi.mocked(apiRequest).mockResolvedValue(undefined)
    await deleteTarget('a b/c', 't 1/2')
    expect(apiRequest).toHaveBeenCalledWith('DELETE', '/api/services/a%20b%2Fc/targets/t%201%2F2')
  })

  it('lets a rejection reach the caller unchanged (NFR-8)', async () => {
    const error = problem(403, 'csrf_failed')
    vi.mocked(apiRequest).mockRejectedValue(error)
    await expect(deleteTarget('abc', 't1')).rejects.toBe(error)
  })
})

describe('targetsQueryKey', () => {
  it('does not start with the services key', () => {
    expect(targetsQueryKey('abc')[0]).not.toBe(servicesQueryKey[0])
    expect(targetsQueryKey('abc')).toContain('abc')
  })
})
