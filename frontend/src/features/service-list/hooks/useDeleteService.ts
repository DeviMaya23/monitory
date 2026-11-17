import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../../components/ui/useToast'
import { ApiError } from '../../../lib/api/ApiError'
import { deleteService, servicesQueryKey, type Service, type ServiceList } from '../../../lib/api/services'

/** How the dialog last closed: the service is gone from the list (`removed`), or the list is as it was (`kept`). */
export type ClosedAs = 'removed' | 'kept'

/** The answer to a delete, by status and code (never by message text). */
type Outcome = 'unauthenticated' | 'already-deleted' | 'csrf' | 'failed'

function toOutcome(error: unknown): Outcome {
  if (error instanceof ApiError) {
    if (error.status === 401 && error.code === 'unauthenticated') return 'unauthenticated'
    if (error.status === 404 && error.code === 'not_found') return 'already-deleted'
    if (error.status === 403 && error.code === 'csrf_failed') return 'csrf'
  }
  return 'failed'
}

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

  /** Takes the service out of the cached list, keeping the time of the last real load. */
  const removeFromList = async (id: string) => {
    // A refresh that started before the delete must not put the row back when it answers.
    await queryClient.cancelQueries({ queryKey: servicesQueryKey })
    const entry = queryClient.getQueryState<ServiceList>(servicesQueryKey)
    if (!entry?.data) return
    queryClient.setQueryData<ServiceList>(
      servicesQueryKey,
      (list) => list?.filter((service) => service.id !== id),
      { updatedAt: entry.dataUpdatedAt },
    )
  }

  const mutation = useMutation({
    mutationFn: (service: Service) => deleteService(service.id),
    onSuccess: async (_result, service) => {
      await removeFromList(service.id)
      toast.show({ kind: 'success', message: 'Service deleted.' })
      setClosedAs('removed')
    },
    onError: async (error, service) => {
      const outcome = toOutcome(error)
      if (outcome === 'already-deleted') {
        await removeFromList(service.id)
        toast.show({ kind: 'error', message: 'That service was already deleted.' })
        setClosedAs('removed')
        return
      }
      setClosedAs('kept')
      if (outcome === 'csrf') {
        toast.show({
          kind: 'error',
          message: 'The request wasn’t accepted. Reload and try again.',
          action: { label: 'Reload', onClick: () => window.location.reload() },
        })
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
