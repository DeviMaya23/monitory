import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../../components/ui/useToast'
import { pauseService, resumeService, type Service } from '../../../lib/api/services'
import { csrfToast, goneToast, toOutcome } from '../lib/rowActionToasts'
import { removeFromList, replaceInList } from '../lib/servicesCache'

/** What `usePauseService` returns, for the components that show the rows. */
export type PauseServiceFlow = ReturnType<typeof usePauseService>

/**
 * Pause and resume of the services in the list (FR-75): the request, the change to the cached
 * list when the server answers, and the toasts. Each row has its own request in flight.
 */
export function usePauseService() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  // The state lags a render behind; this stops a second toggle in the same tick.
  const inFlight = useRef(new Set<string>())

  const mutation = useMutation({
    mutationFn: (service: Service) => (service.paused ? resumeService(service.id) : pauseService(service.id)),
    onSuccess: async (answer, service) => {
      await replaceInList(queryClient, answer)
      toast.show({
        kind: 'success',
        message: service.paused
          ? `“${answer.name}” resumed. Checking now.`
          : `“${answer.name}” paused. Checks and alerts stopped.`,
      })
    },
    onError: async (error, service) => {
      const outcome = toOutcome(error)
      if (outcome === 'gone') {
        await removeFromList(queryClient, service.id)
        toast.show(goneToast())
      } else if (outcome === 'csrf') {
        toast.show(csrfToast())
      } else if (outcome === 'failed') {
        toast.show({
          kind: 'error',
          message: service.paused ? 'Couldn’t resume the service. Try again.' : 'Couldn’t pause the service. Try again.',
        })
      }
    },
    onSettled: (_answer, _error, service) => {
      inFlight.current.delete(service.id)
      setPendingIds((ids) => {
        const next = new Set(ids)
        next.delete(service.id)
        return next
      })
    },
  })

  return {
    /** A request for this service is in flight. */
    isPending: (id: string) => pendingIds.has(id),
    /** Pauses an unpaused service and resumes a paused one; does nothing while its request is in flight. */
    toggle: (service: Service) => {
      if (inFlight.current.has(service.id)) return
      inFlight.current.add(service.id)
      setPendingIds((ids) => new Set(ids).add(service.id))
      mutation.mutate(service)
    },
  }
}
