import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
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
