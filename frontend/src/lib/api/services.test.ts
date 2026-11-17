import { beforeEach, describe, expect, it, vi } from 'vitest'
import { problem } from '../../test/fixtures'
import { apiRequest } from './request'
import { deleteService } from './services'

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
