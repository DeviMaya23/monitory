import type { QueryClient } from '@tanstack/react-query'
import { servicesQueryKey, type Service, type ServiceList } from '../../../lib/api/services'

/**
 * Changes the cached list, keeping the time of the last real load. A list request in flight is
 * cancelled first, so an older answer cannot put the old rows back. Nothing happens when no list
 * is cached.
 */
async function changeList(queryClient: QueryClient, change: (list: ServiceList) => ServiceList) {
  await queryClient.cancelQueries({ queryKey: servicesQueryKey })
  const entry = queryClient.getQueryState<ServiceList>(servicesQueryKey)
  if (!entry?.data) return
  queryClient.setQueryData<ServiceList>(servicesQueryKey, (list) => (list ? change(list) : list), {
    updatedAt: entry.dataUpdatedAt,
  })
}

/** Takes the service with this id out of the cached list. */
export function removeFromList(queryClient: QueryClient, id: string): Promise<void> {
  return changeList(queryClient, (list) => list.filter((service) => service.id !== id))
}

/** Puts `service` in the place of the cached one with the same id; an id not in the list changes nothing. */
export function replaceInList(queryClient: QueryClient, service: Service): Promise<void> {
  return changeList(queryClient, (list) => list.map((item) => (item.id === service.id ? service : item)))
}
