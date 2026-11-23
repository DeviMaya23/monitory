import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../../components/ui/useToast'
import {
  getPublicViewSettings,
  publicViewQueryKey,
  updatePublicViewSettings,
  type PublicViewSettings,
} from '../../../lib/api/publicView'
import { REFRESH_INTERVAL_MS } from '../../../lib/config'
import { csrfToast } from '../../../lib/requestNotAccepted'
import { toOutcome } from '../lib/rowActionToasts'

export type PublicViewState = 'loading' | 'not-loaded' | 'on' | 'off'

/** What `usePublicView` returns, for the components that show the switch. */
export type PublicViewFlow = ReturnType<typeof usePublicView>

/**
 * The public view setting (FR-26): one query, refreshed with the list, and the switch that changes it.
 * The switch shows the last known value until the server answers.
 */
export function usePublicView() {
  const queryClient = useQueryClient()
  const toast = useToast()
  // The state lags a render behind; this stops a second toggle in the same tick.
  const inFlight = useRef(false)

  const query = useQuery({
    queryKey: publicViewQueryKey,
    queryFn: getPublicViewSettings,
    retry: false,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => updatePublicViewSettings({ enabled }),
    onSuccess: async (answer) => {
      // A refetch in flight is cancelled first, so an older answer cannot put the old value back.
      await queryClient.cancelQueries({ queryKey: publicViewQueryKey })
      queryClient.setQueryData<PublicViewSettings>(publicViewQueryKey, answer)
      toast.show({ kind: 'success', message: answer.enabled ? 'Public page turned on.' : 'Public page turned off.' })
    },
    onError: (error, enabled) => {
      // A 404 is not in the contract: it is the generic failure here, not "already deleted".
      const outcome = toOutcome(error)
      if (outcome === 'csrf') {
        toast.show(csrfToast())
      } else if (outcome !== 'unauthenticated') {
        toast.show({
          kind: 'error',
          message: enabled ? 'Couldn’t turn the public page on. Try again.' : 'Couldn’t turn the public page off. Try again.',
        })
      }
    },
    onSettled: () => {
      inFlight.current = false
    },
  })

  const data = query.data
  let state: PublicViewState
  if (data === undefined) state = query.isFetched ? 'not-loaded' : 'loading'
  else state = data.enabled ? 'on' : 'off'

  return {
    state,
    /** Fetches the setting again; the held value stays while it runs. */
    refresh: () => {
      void query.refetch()
    },
    /** Asks the server to turn the public view on or off; does nothing while a request is in flight. */
    toggle: (next: boolean) => {
      if (inFlight.current) return
      inFlight.current = true
      mutation.mutate(next)
    },
  }
}
