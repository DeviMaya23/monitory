import { beforeEach, describe, expect, it, vi } from 'vitest'
import { problem } from '../../test/fixtures'
import { apiRequest } from './request'
import { createTarget, deleteTarget, listTargets, targetsQueryKey, updateTarget, type TargetInput } from './targets'
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

const input: TargetInput = { type: 'email', name: 'Ops', address: 'ops@example.com' }

describe('createTarget', () => {
  it('calls POST once with the body and returns the value', async () => {
    const saved = { id: 't1' } as never
    vi.mocked(apiRequest).mockResolvedValue(saved)
    await expect(createTarget('s1', input)).resolves.toBe(saved)
    expect(apiRequest).toHaveBeenCalledOnce()
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/services/s1/targets', input)
  })

  it('encodes the service id', async () => {
    vi.mocked(apiRequest).mockResolvedValue({})
    await createTarget('a b/c', input)
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/services/a%20b%2Fc/targets', input)
  })

  it('lets a rejection reach the caller unchanged (NFR-8)', async () => {
    const error = problem(403, 'csrf_failed')
    vi.mocked(apiRequest).mockRejectedValue(error)
    await expect(createTarget('s1', input)).rejects.toBe(error)
  })
})

describe('updateTarget', () => {
  it('calls PUT once with both ids and the body', async () => {
    vi.mocked(apiRequest).mockResolvedValue({})
    await updateTarget('s1', 't1', input)
    expect(apiRequest).toHaveBeenCalledOnce()
    expect(apiRequest).toHaveBeenCalledWith('PUT', '/api/services/s1/targets/t1', input)
  })

  it('encodes both ids', async () => {
    vi.mocked(apiRequest).mockResolvedValue({})
    await updateTarget('a b/c', 'x y/z', input)
    expect(apiRequest).toHaveBeenCalledWith('PUT', '/api/services/a%20b%2Fc/targets/x%20y%2Fz', input)
  })

  it('lets a rejection reach the caller unchanged (NFR-8)', async () => {
    const error = problem(409, 'target_duplicate')
    vi.mocked(apiRequest).mockRejectedValue(error)
    await expect(updateTarget('s1', 't1', input)).rejects.toBe(error)
  })
})
