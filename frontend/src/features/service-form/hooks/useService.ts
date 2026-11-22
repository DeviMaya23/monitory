import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../lib/api/ApiError'
import { getService, serviceQueryKey, servicesQueryKey, type Service } from '../../../lib/api/services'

export type ServiceView =
  | { state: 'loading' }
  | { state: 'session-ended' }
  | { state: 'not-found' }
  | { state: 'could-not-load' }
  | { state: 'loaded'; service: Service }

/**
 * One service for the Edit screen: always asked from the server (nothing cached fills the form),
 * no retry, no refetch on focus, nothing kept after the page closes. The screen state is derived
 * from the query, never copied.
 */
export function useService(id: string): ServiceView & { fetching: boolean; refetch: () => void } {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: serviceQueryKey(id),
    queryFn: () => getService(id),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })

  const error = query.error
  const notFound = error instanceof ApiError && error.status === 404 && error.code === 'not_found'
  const sessionEnded = error instanceof ApiError && error.status === 401 && error.code === 'unauthenticated'

  // The service is gone: the dashboard must not show it from a cached list.
  useEffect(() => {
    if (notFound) queryClient.removeQueries({ queryKey: servicesQueryKey, exact: true })
  }, [notFound, queryClient])

  let view: ServiceView
  if (sessionEnded) view = { state: 'session-ended' }
  else if (notFound) view = { state: 'not-found' }
  else if (query.data !== undefined) view = { state: 'loaded', service: query.data }
  else view = query.isError ? { state: 'could-not-load' } : { state: 'loading' }

  return {
    ...view,
    fetching: query.isFetching,
    refetch: () => {
      void query.refetch()
    },
  }
}
