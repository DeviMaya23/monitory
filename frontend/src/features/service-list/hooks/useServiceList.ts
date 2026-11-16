import { useQuery } from '@tanstack/react-query'
import { REFRESH_INTERVAL_MS } from '../../../lib/config'
import { listServices, type Service } from '../../../lib/api/services'

export const SERVICES_KEY = ['services'] as const

export type ServiceListState = 'loading' | 'could-not-load' | 'empty' | 'list'

export type ServiceListView = {
  state: ServiceListState
  /** The services in the order the server sent them; empty unless `state` is `list`. */
  services: readonly Service[]
  /** The last request failed while there is data to show (the "Couldn’t refresh." banner). */
  refreshFailed: boolean
  /** When the last successful response arrived (ms since the epoch); null before the first. */
  lastSuccessAt: number | null
  /** Any request for the list is in flight: first load, refresh, retry. */
  fetching: boolean
  /** Fetches the list again; the rows stay while it runs. */
  refresh: () => void
}

/** The admin's service list: one query, refreshed on an interval, and the screen state derived from it (FR-9, FR-95). */
export function useServiceList(): ServiceListView {
  const query = useQuery({
    queryKey: SERVICES_KEY,
    queryFn: listServices,
    retry: false,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const data = query.data
  let state: ServiceListState
  if (data === undefined) state = query.isFetched ? 'could-not-load' : 'loading'
  else state = data.length === 0 ? 'empty' : 'list'

  return {
    state,
    services: data ?? [],
    refreshFailed: data !== undefined && query.isError,
    lastSuccessAt: data !== undefined ? query.dataUpdatedAt : null,
    fetching: query.isFetching,
    refresh: () => {
      void query.refetch()
    },
  }
}
