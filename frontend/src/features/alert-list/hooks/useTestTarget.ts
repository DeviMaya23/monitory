import { useMemo, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ApiError } from '../../../lib/api/ApiError'
import type { FieldError } from '../../../lib/api/services'
import { testTarget, type TargetInput, type TargetTestResult } from '../../../lib/api/targets'
import type { TargetFormValues } from '../lib/targetForm'

/** How the last test failed as a request. A new object for every failure, so a repeat of the same kind is still a change. */
export type TestFailure =
  | { kind: 'field-errors'; errors: readonly FieldError[] }
  | { kind: 'not-found' }
  | { kind: 'csrf' }
  | { kind: 'unexpected' }

type Variables = { input: TargetInput; sent: TargetFormValues }

/** The failure of a request, by status and code (never by message text); null for a 401, which the shell handles. */
function toFailure(error: unknown): TestFailure | null {
  if (!(error instanceof ApiError)) return { kind: 'unexpected' }
  const errors = error.problem?.errors
  if (error.status === 401 && error.code === 'unauthenticated') return null
  if (error.status === 422 && error.code === 'validation_failed' && errors && errors.length > 0) {
    return { kind: 'field-errors', errors }
  }
  if (error.status === 404 && error.code === 'not_found') return { kind: 'not-found' }
  if (error.status === 403 && error.code === 'csrf_failed') return { kind: 'csrf' }
  return { kind: 'unexpected' }
}

/**
 * Sends one test alert of a service (FR-107). It changes nothing the screen holds: no cache, no
 * toast. A delivered or a failed test is a result; only a request that failed is a failure, and
 * that is a value.
 */
export function useTestTarget(serviceId: string) {
  // The pending flag lags a render behind; this stops a second run in the same tick.
  const inFlight = useRef(false)

  const mutation = useMutation({
    mutationFn: ({ input }: Variables) => testTarget(serviceId, input),
    onSettled: () => {
      inFlight.current = false
    },
  })

  // Derived from the mutation, which starts every request with no error: a repeat is a new object.
  const { error, variables, data, isPending } = mutation
  const failure = useMemo(() => (error && variables ? toFailure(error) : null), [error, variables])

  return {
    /** A request is in flight. */
    testing: isPending,
    /** The last request's body, or null before the first. */
    input: variables?.input ?? null,
    /** The form's values the last request was sent with, or null before the first. */
    sent: variables?.sent ?? null,
    /** The last answer, delivered or failed; null while none, or after a failure. */
    result: (data ?? null) as TargetTestResult | null,
    failure,
    /** Drops the last result and failure (a new attempt starts). Does nothing while a request is in flight. */
    clear: () => {
      if (!inFlight.current) mutation.reset()
    },
    /** Sends the input once (does nothing while a request is in flight). Resolves when it has been answered. */
    run: async (input: TargetInput, sent: TargetFormValues): Promise<void> => {
      if (inFlight.current) return
      inFlight.current = true
      try {
        await mutation.mutateAsync({ input, sent })
      } catch {
        // A failure is `failure`.
      }
    },
  }
}
