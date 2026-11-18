import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../../components/ui/useToast'
import { ApiError } from '../../../lib/api/ApiError'
import { deleteTarget, targetsQueryKey, type TargetList } from '../../../lib/api/targets'

/** The answer to a removal, by status and code (never by message text). */
type Outcome = 'unauthenticated' | 'already-removed' | 'csrf' | 'failed'

function toOutcome(error: unknown): Outcome {
  if (error instanceof ApiError) {
    if (error.status === 401 && error.code === 'unauthenticated') return 'unauthenticated'
    if (error.status === 404 && error.code === 'not_found') return 'already-removed'
    if (error.status === 403 && error.code === 'csrf_failed') return 'csrf'
  }
  return 'failed'
}

/** How a question about one target ended: the target is gone from the list, or the row is as it was. */
export type RemovalClosed = { id: string; as: 'removed' | 'kept' }

/** What `useRemoveTarget` returns, for the components that show the flow. */
export type RemoveTargetFlow = ReturnType<typeof useRemoveTarget>

type Variables = { serviceId: string; targetId: string }

/** The removal flow of one service's targets, from the click to the outcome (FR-16): the question, the request, the cache change and the toasts. */
export function useRemoveTarget(serviceId: string) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [askedId, setAskedId] = useState<string | null>(null)
  const [closed, setClosed] = useState<RemovalClosed | null>(null)
  // The pending flag lags a render behind; this stops a second confirm in the same tick.
  const inFlight = useRef(false)

  /** Takes the target out of the cached list, keeping the time of the last real load. */
  const removeFromList = async ({ serviceId: sid, targetId }: Variables) => {
    const key = targetsQueryKey(sid)
    // A reload that started before the removal must not put the row back when it answers.
    await queryClient.cancelQueries({ queryKey: key })
    const entry = queryClient.getQueryState<TargetList>(key)
    if (!entry?.data) return
    queryClient.setQueryData<TargetList>(key, (list) => list?.filter((target) => target.id !== targetId), {
      updatedAt: entry.dataUpdatedAt,
    })
  }

  const mutation = useMutation({
    mutationFn: ({ serviceId: sid, targetId }: Variables) => deleteTarget(sid, targetId),
    onSuccess: async (_result, variables) => {
      await removeFromList(variables)
      toast.show({ kind: 'success', message: 'Target removed.' })
      setClosed({ id: variables.targetId, as: 'removed' })
    },
    onError: async (error, variables) => {
      const outcome = toOutcome(error)
      if (outcome === 'unauthenticated') return
      if (outcome === 'already-removed') {
        await removeFromList(variables)
        toast.show({
          kind: 'error',
          message: 'That target was already removed.',
        })
        setClosed({ id: variables.targetId, as: 'removed' })
        // Not awaited: the removal settles now; a deleted service then shows "not found".
        void queryClient.refetchQueries({
          queryKey: targetsQueryKey(variables.serviceId),
          exact: true,
        })
        return
      }
      if (outcome === 'csrf') {
        toast.show({
          kind: 'error',
          message: 'The request wasn’t accepted. Reload and try again.',
          action: { label: 'Reload', onClick: () => window.location.reload() },
        })
      } else {
        toast.show({
          kind: 'error',
          message: 'Couldn’t remove the target. Try again.',
        })
      }
      setClosed({ id: variables.targetId, as: 'kept' })
    },
    onSettled: () => {
      inFlight.current = false
      setAskedId(null)
    },
  })

  return {
    /** The id of the target the row asks about; null when no row asks. */
    askedId,
    /** The request is in flight. */
    removing: mutation.isPending,
    /** How the last question ended; a new object each time, null before the first. */
    closed,
    /** Opens the question for a target; does nothing while a request is in flight. */
    ask: (targetId: string) => {
      if (inFlight.current) return
      setAskedId(targetId)
    },
    /** Closes the question without sending anything; does nothing while a request is in flight. */
    cancel: () => {
      if (inFlight.current || askedId === null) return
      setClosed({ id: askedId, as: 'kept' })
      setAskedId(null)
    },
    /** Closes the question without sending anything and without a focus move (a dialog opens instead); does nothing while a request is in flight. */
    dismiss: () => {
      if (inFlight.current) return
      setAskedId(null)
    },
    /** Sends the removal for the asked target; does nothing without one or while a request is in flight. */
    confirm: () => {
      if (askedId === null || inFlight.current) return
      inFlight.current = true
      mutation.mutate({ serviceId, targetId: askedId })
    },
  }
}
