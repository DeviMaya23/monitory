import { beforeEach, describe, expect, it, vi } from 'vitest'
import { problem } from '../../test/fixtures'
import { apiRequest } from './request'
import { makeService } from '../../test/fixtures'
import { deleteService, getService, pauseService, resumeService, serviceQueryKey, servicesQueryKey, testServiceCheck, updateService } from './services'

vi.mock('./request')

beforeEach(() => {
  vi.resetAllMocks()
})

describe('deleteService', () => {
  it('sends one DELETE for the id and resolves to undefined', async () => {
    vi.mocked(apiRequest).mockResolvedValue(undefined)
    await expect(deleteService('abc')).resolves.toBeUndefined()
    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(apiRequest).toHaveBeenCalledWith('DELETE', '/api/services/abc')
  })

  it('encodes the id in the path', async () => {
    vi.mocked(apiRequest).mockResolvedValue(undefined)
    await deleteService('a b/c')
    expect(apiRequest).toHaveBeenCalledWith('DELETE', '/api/services/a%20b%2Fc')
  })

  it('lets a rejection reach the caller unchanged (NFR-8)', async () => {
    const error = problem(403, 'csrf_failed')
    vi.mocked(apiRequest).mockRejectedValue(error)
    await expect(deleteService('abc')).rejects.toBe(error)
  })
})

describe('pauseService and resumeService', () => {
  it('pauseService sends one POST with no body to the pause path and resolves with the service', async () => {
    const answer = makeService({ paused: true })
    vi.mocked(apiRequest).mockResolvedValue(answer)
    await expect(pauseService('abc')).resolves.toBe(answer)
    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/services/abc/pause')
  })

  it('resumeService encodes the id and sends one POST with no body to the resume path', async () => {
    const answer = makeService()
    vi.mocked(apiRequest).mockResolvedValue(answer)
    await expect(resumeService('x/y')).resolves.toBe(answer)
    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/services/x%2Fy/resume')
  })
})

describe('getService and updateService', () => {
  it('getService sends one GET for the encoded id and resolves with the service', async () => {
    const answer = makeService()
    vi.mocked(apiRequest).mockResolvedValue(answer)
    await expect(getService('a b/c')).resolves.toBe(answer)
    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/services/a%20b%2Fc')
  })

  it('updateService sends one PUT for the encoded id with the body', async () => {
    const answer = makeService()
    vi.mocked(apiRequest).mockResolvedValue(answer)
    const input = { name: 'X', check: { type: 'tcp' as const, host: 'h', port: 1 } }
    await expect(updateService('a b/c', input)).resolves.toBe(answer)
    expect(apiRequest).toHaveBeenCalledWith('PUT', '/api/services/a%20b%2Fc', input)
  })

  it('serviceQueryKey sits under the list key', () => {
    expect(serviceQueryKey('abc')).toEqual([...servicesQueryKey, 'abc'])
  })
})

describe('testServiceCheck', () => {
  it('sends one POST to the service-tests path with the body and resolves with the result', async () => {
    const answer = { healthy: true, duration_ms: 312 }
    vi.mocked(apiRequest).mockResolvedValue(answer)
    const input = { check: { type: 'tcp' as const, host: 'db.example.com', port: 5432 }, settings: { timeout_seconds: 7 } }
    await expect(testServiceCheck(input)).resolves.toBe(answer)
    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/service-tests', input)
  })
})
