import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../../lib/api/ApiError'
import { getPublicDashboard, type PublicService } from '../../../lib/api/publicDashboard'
import { REFRESH_INTERVAL_MS } from '../../../lib/config'

export const PUBLIC_DASHBOARD_KEY = ['public-dashboard'] as const

export type PublicDashboardState = 'loading' | 'unavailable' | 'could-not-load' | 'empty' | 'list'

export type RateLimit = {
  /** Whole seconds until the page asks again; null when the answer had no usable `Retry-After`. */
  secondsLeft: number | null
}

export type PublicDashboardView = {
  state: PublicDashboardState
  /** The rows in the order the server sent them; empty unless `state` is `list`. */
  services: readonly PublicService[]
  /** The last request failed (not a 404 unavailable, not a 429) while rows are on screen. */
  refreshFailed: boolean
  /** When the last successful response arrived (ms since the epoch); null before the first. */
  lastSuccessAt: number | null
  /** Any request is in flight. */
  fetching: boolean
  /** Set while the last answer was a 429. */
  rateLimit: RateLimit | null
  /** Fetches again; the rows stay while it runs. */
  refresh: () => void
}

// The last special answer, kept here because TanStack clears a data-less query's error on refetch.
type Special =
  | { kind: 'unavailable' }
  | { kind: 'rate'; retryAfter: number | null; at: number }

function classify(error: unknown): Special | null {
  if (!(error instanceof ApiError)) return null
  if (error.status === 404 && error.code === 'public_view_unavailable') return { kind: 'unavailable' }
  if (error.status === 429) {
    const usable = error.retryAfter !== null && error.retryAfter >= 1
    return { kind: 'rate', retryAfter: usable ? error.retryAfter : null, at: Date.now() }
  }
  return null
}

/** The anonymous public view: one query refreshed on an interval, the screen state and the 429 countdown derived from it (FR-28 to FR-32). */
export function usePublicDashboard(): PublicDashboardView {
  const [special, setSpecial] = useState<Special | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const unavailable = special?.kind === 'unavailable'
  const rate = special?.kind === 'rate' ? special : null
  const secondsLeft =
    rate === null || rate.retryAfter === null
      ? null
      : Math.max(0, rate.retryAfter - Math.floor(Math.max(0, now - rate.at) / 1000))
  // No automatic refresh when unavailable, nor while a countdown is above 0 (it would fall inside the server's wait).
  const held = unavailable || (secondsLeft !== null && secondsLeft > 0)

  const query = useQuery({
    queryKey: PUBLIC_DASHBOARD_KEY,
    queryFn: async () => {
      try {
        const dashboard = await getPublicDashboard()
        setSpecial(null)
        return dashboard
      } catch (error) {
        setSpecial(classify(error))
        throw error
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchIntervalInBackground: true,
    refetchInterval: held ? false : REFRESH_INTERVAL_MS,
  })
  const { refetch } = query

  // One timer per 429 answer: it ticks the countdown and refreshes once at zero.
  useEffect(() => {
    if (rate === null || rate.retryAfter === null) return
    const { at, retryAfter } = rate
    const id = setInterval(() => {
      const tick = Date.now()
      setNow(tick)
      if (tick - at >= retryAfter * 1000) {
        clearInterval(id)
        void refetch()
      }
    }, 1000)
    return () => clearInterval(id)
  }, [rate, refetch])

  const data = query.data
  let state: PublicDashboardState
  if (unavailable) state = 'unavailable'
  else if (data === undefined) state = query.isFetched ? 'could-not-load' : 'loading'
  else state = data.services.length === 0 ? 'empty' : 'list'

  return {
    state,
    services: state === 'list' && data !== undefined ? data.services : [],
    refreshFailed: data !== undefined && query.isError && !unavailable && rate === null,
    lastSuccessAt: data !== undefined ? query.dataUpdatedAt : null,
    fetching: query.isFetching,
    rateLimit: rate === null ? null : { secondsLeft },
    refresh: () => {
      void refetch()
    },
  }
}
