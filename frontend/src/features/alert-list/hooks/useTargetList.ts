import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../../lib/api/ApiError'
import { listTargets, targetsQueryKey, type Target } from '../../../lib/api/targets'

export type TargetListState = 'loading' | 'not-found' | 'could-not-load' | 'empty' | 'list'

export type TargetListView = {
  state: TargetListState
  /** The targets in the order the server sent them; empty unless `state` is `list`. */
  targets: readonly Target[]
  /** The last request failed (not a 404) while there is a list to show. */
  refreshFailed: boolean
  /** Any request for the list is in flight. */
  fetching: boolean
  /** Fetches the list again; the rows stay while it runs. */
  refresh: () => void
}

/** One service's alert list: a single query with no retry and no interval, and the screen state derived from it (FR-17). */
export function useTargetList(serviceId: string): TargetListView {
  const query = useQuery({
    queryKey: targetsQueryKey(serviceId),
    queryFn: () => listTargets(serviceId),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const data = query.data
  const notFound = query.error instanceof ApiError && query.error.status === 404 && query.error.code === 'not_found'
  let state: TargetListState
  if (notFound) state = 'not-found'
  else if (data === undefined) state = query.isFetched ? 'could-not-load' : 'loading'
  else state = data.length === 0 ? 'empty' : 'list'

  return {
    state,
    targets: state === 'list' ? (data ?? []) : [],
    refreshFailed: data !== undefined && query.isError && !notFound,
    fetching: query.isFetching,
    refresh: () => {
      void query.refetch()
    },
  }
}
