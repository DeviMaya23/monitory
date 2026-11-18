import { useMemo, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../../components/ui/useToast'
import { ApiError } from '../../../lib/api/ApiError'
import type { FieldError } from '../../../lib/api/services'
import {
  createTarget,
  targetsQueryKey,
  updateTarget,
  type Target,
  type TargetInput,
  type TargetList,
} from '../../../lib/api/targets'

/** How the last save failed. A new object for every failure, so a repeat of the same kind is still a change. */
export type SaveFailure =
  | { kind: 'field-errors'; errors: readonly FieldError[] }
  | { kind: 'duplicate'; type: TargetInput['type'] }
  | { kind: 'full' }
  | { kind: 'not-found' }
  | { kind: 'csrf' }
  | { kind: 'unexpected' }

type Variables = { input: TargetInput; targetId: string | null }

/** The failure of a request, by status and code (never by message text); null for a 401, which the shell handles. */
function toFailure(error: unknown, { input, targetId }: Variables): SaveFailure | null {
  if (!(error instanceof ApiError)) return { kind: 'unexpected' }
  const errors = error.problem?.errors
  if (error.status === 401 && error.code === 'unauthenticated') return null
  if (error.status === 422 && error.code === 'validation_failed' && errors && errors.length > 0) {
    return { kind: 'field-errors', errors }
  }
  if (error.status === 409 && error.code === 'target_duplicate') return { kind: 'duplicate', type: input.type }
  // The contract lists no `alert_list_full` for an update.
  if (error.status === 409 && error.code === 'alert_list_full' && targetId === null) return { kind: 'full' }
  if (error.status === 404 && error.code === 'not_found') return { kind: 'not-found' }
  if (error.status === 403 && error.code === 'csrf_failed') return { kind: 'csrf' }
  return { kind: 'unexpected' }
}

/**
 * Saves a target of one service: `createTarget`, or `updateTarget` when given a target id. A
 * success updates the cached list in place and shows the toast (both in the mutation's options,
 * so they happen even if the page has gone); a failure is a value.
 */
export function useSaveTarget(serviceId: string) {
  const queryClient = useQueryClient()
  const toast = useToast()
  // The pending flag lags a render behind; this stops a second submit in the same tick.
  const inFlight = useRef(false)

  const mutation = useMutation({
    mutationFn: ({ input, targetId }: Variables) =>
      targetId === null ? createTarget(serviceId, input) : updateTarget(serviceId, targetId, input),
    onSuccess: async (saved, { targetId }) => {
      const key = targetsQueryKey(serviceId)
      // An older reload must not overwrite the new target when it answers.
      await queryClient.cancelQueries({ queryKey: key })
      const entry = queryClient.getQueryState<TargetList>(key)
      if (entry?.data) {
        queryClient.setQueryData<TargetList>(
          key,
          (list) => (targetId === null ? [...(list ?? []), saved] : list?.map((t) => (t.id === saved.id ? saved : t))),
          { updatedAt: entry.dataUpdatedAt },
        )
      }
      toast.show({
        kind: 'success',
        message: targetId === null ? 'Target added.' : 'Target saved.',
      })
    },
    onSettled: () => {
      inFlight.current = false
    },
  })

  // Derived from the mutation, which starts every request with no error: a repeat is a new object.
  const { error, variables } = mutation
  const failure = useMemo(() => (error && variables ? toFailure(error, variables) : null), [error, variables])

  return {
    /** A request is in flight. */
    saving: mutation.isPending,
    failure,
    /** Drops the last failure (a new attempt starts). Does nothing while a request is in flight. */
    clearFailure: () => {
      if (!inFlight.current) mutation.reset()
    },
    /**
     * Sends the input once (does nothing while a request is in flight). Resolves with the saved
     * target, or with null after a failure.
     */
    submit: async (input: TargetInput, targetId: string | null): Promise<Target | null> => {
      if (inFlight.current) return null
      inFlight.current = true
      try {
        return await mutation.mutateAsync({ input, targetId })
      } catch {
        return null
      }
    },
  }
}
