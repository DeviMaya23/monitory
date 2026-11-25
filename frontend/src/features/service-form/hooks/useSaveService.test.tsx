import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { servicesQueryKey, type Service } from '../../../lib/api/services'
import { makeService, problem } from '../../../test/fixtures'
import { ADD_DEFAULT_VALUES } from '../lib/formValues'
import { toFailure, useSaveService } from './useSaveService'

describe('toFailure by mode', () => {
  it('create: a 404 not_found is the generic failure and a limit is the limit', () => {
    expect(toFailure(problem(404, 'not_found'), 'create')).toEqual({ kind: 'unexpected' })
    expect(toFailure(problem(409, 'service_limit_reached'), 'create')).toEqual({ kind: 'limit' })
  })

  it('update: a 404 not_found is not-found, a 404 with another code is generic, a limit is generic', () => {
    expect(toFailure(problem(404, 'not_found'), 'update')).toEqual({ kind: 'not-found' })
    expect(toFailure(problem(404, 'internal_error'), 'update')).toEqual({ kind: 'unexpected' })
    expect(toFailure(problem(409, 'service_limit_reached'), 'update')).toEqual({ kind: 'unexpected' })
  })
})

describe('useSaveService', () => {
  function setup(send: () => Promise<Service>) {
    const client = new QueryClient()
    client.setQueryData(servicesQueryKey, [makeService()])
    const onSaved = vi.fn()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return { client, onSaved, ...renderHook(() => useSaveService('update', send, onSaved), { wrapper }) }
  }

  it('sends once for two submits in the same tick', async () => {
    let resolve: (service: Service) => void = () => {}
    const send = vi.fn(() => new Promise<Service>((r) => (resolve = r)))
    const { result } = setup(send)
    await act(async () => {
      void result.current.submit(ADD_DEFAULT_VALUES)
      void result.current.submit(ADD_DEFAULT_VALUES)
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(result.current.saving).toBe(true)
    await act(async () => resolve(makeService()))
    expect(result.current.saving).toBe(false)
    expect(result.current.saved).toBe(true)
  })

  describe('the cached list after a save', () => {
    function withObserver(send: () => Promise<Service>, listFn: (() => Promise<Service[]>) | null) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      client.setQueryData(servicesQueryKey, [makeService()])
      const onSaved = vi.fn()
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )
      const observer = listFn
        ? renderHook(
            () => useQuery({ queryKey: servicesQueryKey, queryFn: () => listFn() as Promise<Service[]>, staleTime: Infinity }),
            { wrapper },
          )
        : null
      const saver = renderHook(() => useSaveService('update', send, onSaved), { wrapper })
      return { client, onSaved, observer, saver }
    }

    it('refetches it, and keeps it cached, when a list is mounted; onSaved runs once', async () => {
      const list = vi.fn(async () => [makeService({ name: 'Fresh' })])
      const { client, onSaved, saver } = withObserver(async () => makeService(), list)
      await waitFor(() => expect(list).toHaveBeenCalledTimes(0))
      await act(async () => {
        await saver.result.current.submit(ADD_DEFAULT_VALUES)
      })
      await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(client.getQueryData<Service[]>(servicesQueryKey)?.[0].name).toBe('Fresh'))
      expect(onSaved).toHaveBeenCalledTimes(1)
    })

    it('does not wait for the refetch: onSaved and saved come while it is still pending, after it started', async () => {
      let release: (list: Service[]) => void = () => {}
      const list = vi.fn(() => new Promise<Service[]>((resolve) => (release = resolve)))
      const { onSaved, saver } = withObserver(async () => makeService(), list)
      const startedWhenSaved: number[] = []
      onSaved.mockImplementation(() => startedWhenSaved.push(list.mock.calls.length))
      await act(async () => {
        await saver.result.current.submit(ADD_DEFAULT_VALUES)
      })
      expect(onSaved).toHaveBeenCalledTimes(1)
      expect(startedWhenSaved).toEqual([1])
      expect(saver.result.current.saved).toBe(true)
      await act(async () => release([]))
    })

    it('a failed refetch changes nothing about the save: saved, no failure, onSaved ran', async () => {
      const list = vi.fn(async () => {
        throw new Error('down')
      })
      const { onSaved, saver } = withObserver(async () => makeService(), list)
      await act(async () => {
        await saver.result.current.submit(ADD_DEFAULT_VALUES)
      })
      await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
      expect(saver.result.current.saved).toBe(true)
      expect(saver.result.current.failure).toBeNull()
      expect(onSaved).toHaveBeenCalledTimes(1)
    })

    it('removes it when no list is mounted', async () => {
      const { client, onSaved, saver } = withObserver(async () => makeService(), null)
      await act(async () => {
        await saver.result.current.submit(ADD_DEFAULT_VALUES)
      })
      expect(client.getQueryData(servicesQueryKey)).toBeUndefined()
      expect(onSaved).toHaveBeenCalledTimes(1)
    })

    it('not-found: refetched when a list is mounted', async () => {
      const list = vi.fn(async () => [])
      const { client, saver } = withObserver(() => Promise.reject(problem(404, 'not_found')), list)
      await act(async () => {
        await saver.result.current.submit(ADD_DEFAULT_VALUES)
      })
      await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
      expect(client.getQueryData(servicesQueryKey)).toEqual([])
      expect(saver.result.current.failure).toEqual({ kind: 'not-found' })
    })

    it('not-found: removed when no list is mounted', async () => {
      const { client, saver } = withObserver(() => Promise.reject(problem(404, 'not_found')), null)
      await act(async () => {
        await saver.result.current.submit(ADD_DEFAULT_VALUES)
      })
      expect(client.getQueryData(servicesQueryKey)).toBeUndefined()
    })
  })

  it('drops the list on success even when the form has left, and then does not call onSaved', async () => {
    let resolve: (service: Service) => void = () => {}
    const { result, client, onSaved, unmount } = setup(() => new Promise<Service>((r) => (resolve = r)))
    await act(async () => {
      void result.current.submit(ADD_DEFAULT_VALUES)
    })
    unmount()
    await act(async () => resolve(makeService()))
    expect(client.getQueryData(servicesQueryKey)).toBeUndefined()
    expect(onSaved).not.toHaveBeenCalled()
  })
})
