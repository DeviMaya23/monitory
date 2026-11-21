import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../../components/ui/useToast'
import { deleteService, type Service } from '../../../lib/api/services'
import { csrfToast, goneToast, toOutcome } from '../lib/rowActionToasts'
import { removeFromList } from '../lib/servicesCache'

/** How the dialog last closed: the service is gone from the list (`removed`), or the list is as it was (`kept`). */
export type ClosedAs = 'removed' | 'kept'

/** What `useDeleteService` returns, for the components that show the flow. */
export type DeleteServiceFlow = ReturnType<typeof useDeleteService>

/**
 * The delete flow of one service, from the click to the outcome (FR-8, FR-72): the service the
 * dialog asks about, the request, the change to the cached list and the toasts.
 */
export function useDeleteService() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [asked, setAsked] = useState<Service | null>(null)
  const [closedAs, setClosedAs] = useState<ClosedAs | null>(null)
  // The pending flag lags a render behind; this stops a second confirm in the same tick.
  const inFlight = useRef(false)

  const mutation = useMutation({
    mutationFn: (service: Service) => deleteService(service.id),
    onSuccess: async (_result, service) => {
      await removeFromList(queryClient, service.id)
      toast.show({ kind: 'success', message: 'Service deleted.' })
      setClosedAs('removed')
    },
    onError: async (error, service) => {
      const outcome = toOutcome(error)
      if (outcome === 'gone') {
        await removeFromList(queryClient, service.id)
        toast.show(goneToast())
        setClosedAs('removed')
        return
      }
      setClosedAs('kept')
      if (outcome === 'csrf') {
        toast.show(csrfToast())
      } else if (outcome === 'failed') {
        toast.show({ kind: 'error', message: 'Couldn’t delete the service. Try again.' })
      }
    },
    onSettled: () => {
      inFlight.current = false
      setAsked(null)
    },
  })

  return {
    /** The service the dialog asks about; null when it is closed. */
    asked,
    /** The request is in flight. */
    deleting: mutation.isPending,
    /** How the dialog last closed; null before the first close. */
    closedAs,
    /** Opens the question for a service (a snapshot of it). */
    ask: (service: Service) => setAsked(service),
    /** Closes the question without sending anything; does nothing while a request is in flight. */
    cancel: () => {
      if (inFlight.current) return
      setAsked(null)
      setClosedAs('kept')
    },
    /** Sends the delete for the asked service; does nothing without one or while a request is in flight. */
    confirm: () => {
      if (!asked || inFlight.current) return
      inFlight.current = true
      mutation.mutate(asked)
    },
  }
}
