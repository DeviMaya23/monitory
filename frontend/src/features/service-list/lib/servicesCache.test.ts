import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { servicesQueryKey, type ServiceList } from '../../../lib/api/services'
import { makeService, makeServiceList } from '../../../test/fixtures'
import { removeFromList, replaceInList } from './servicesCache'

const a = makeService({ name: 'a' })
const b = makeService({ name: 'b' })
const c = makeService({ name: 'c' })
const SEEDED_AT = 1_700_000_000_000

function seeded(list: ServiceList | null = makeServiceList(a, b, c)) {
  const client = new QueryClient()
  if (list) client.setQueryData(servicesQueryKey, list, { updatedAt: SEEDED_AT })
  return client
}
const cached = (client: QueryClient) => client.getQueryData<ServiceList>(servicesQueryKey)
const loadedAt = (client: QueryClient) => client.getQueryState(servicesQueryKey)?.dataUpdatedAt

describe('replaceInList', () => {
  it('puts the given service at the same position and leaves the others as they are', async () => {
    const client = seeded()
    const paused = { ...b, paused: true }
    await replaceInList(client, paused)
    const list = cached(client)
    expect(list).toEqual([a, paused, c])
    expect(list?.[0]).toBe(a)
    expect(list?.[2]).toBe(c)
  })

  it('works for the first and the last row', async () => {
    const client = seeded()
    await replaceInList(client, { ...a, paused: true })
    await replaceInList(client, { ...c, paused: true })
    expect(cached(client)?.map((s) => s.paused)).toEqual([true, false, true])
  })

  it('keeps the time of the last real load', async () => {
    const client = seeded()
    await replaceInList(client, { ...b, paused: true })
    expect(loadedAt(client)).toBe(SEEDED_AT)
  })

  it('leaves the list as it is for an id that is not in it', async () => {
    const client = seeded()
    await replaceInList(client, makeService({ name: 'other' }))
    expect(cached(client)).toEqual([a, b, c])
    expect(loadedAt(client)).toBe(SEEDED_AT)
  })

  it('creates nothing when no list is cached', async () => {
    const client = seeded(null)
    await replaceInList(client, b)
    expect(client.getQueryState(servicesQueryKey)).toBeUndefined()
  })

  it('cancels a list request in flight, so an older answer does not bring the old row back', async () => {
    const client = seeded()
    let answer: (list: ServiceList) => void = () => {}
    const refresh = client.fetchQuery({
      queryKey: servicesQueryKey,
      queryFn: ({ signal }) =>
        new Promise<ServiceList>((resolve, reject) => {
          answer = resolve
          signal.addEventListener('abort', () => reject(new Error('cancelled')))
        }),
      staleTime: 0,
    })
    refresh.catch(() => {})
    const paused = { ...b, paused: true }
    await replaceInList(client, paused)
    answer(makeServiceList(a, b, c))
    await Promise.resolve()
    expect(cached(client)).toEqual([a, paused, c])
    expect(client.isFetching({ queryKey: servicesQueryKey })).toBe(0)
  })
})

describe('removeFromList', () => {
  it('takes the service out, keeps the order and the load time', async () => {
    const client = seeded()
    await removeFromList(client, 'id-b')
    expect(cached(client)).toEqual([a, c])
    expect(loadedAt(client)).toBe(SEEDED_AT)
  })

  it('creates nothing when no list is cached', async () => {
    const client = seeded(null)
    await removeFromList(client, 'id-b')
    expect(client.getQueryState(servicesQueryKey)).toBeUndefined()
  })

  it('cancels a list request in flight first', async () => {
    const client = seeded()
    const refresh = client.fetchQuery({
      queryKey: servicesQueryKey,
      queryFn: ({ signal }) =>
        new Promise<ServiceList>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('cancelled')))
        }),
      staleTime: 0,
    })
    refresh.catch(() => {})
    await removeFromList(client, 'id-b')
    expect(client.isFetching({ queryKey: servicesQueryKey })).toBe(0)
    expect(cached(client)).toEqual([a, c])
  })
})
