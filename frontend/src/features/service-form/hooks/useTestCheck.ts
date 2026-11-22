import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../../lib/api/ApiError'
import { testServiceCheck, type FieldError, type ServiceTestResult } from '../../../lib/api/services'
import type { ServiceFormValues } from '../lib/formValues'
import { toTestInput } from '../lib/serviceInput'
import type { ServiceType } from '../lib/serviceType'

export type FailedKind = 'csrf' | 'too-large' | 'unexpected'

/** Where the panel is. `result` carries the type that was sent: it, not the answer, picks the HTTP or TCP lines. */
export type TestState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'result'; result: ServiceTestResult; type: ServiceType }
  | { kind: 'refused' }
  | { kind: 'failed'; reason: FailedKind }

type Outcome = { state: TestState; errors: readonly FieldError[] | null }

/** Classifies a failed request by status and code, never by text. A 401 is the shell's: nothing shows here. */
function classify(error: unknown): Outcome {
  if (error instanceof ApiError) {
    const errors = error.problem?.errors
    if (error.status === 422 && error.code === 'validation_failed' && errors && errors.length > 0) {
      return { state: { kind: 'refused' }, errors }
    }
    if (error.status === 401 && error.code === 'unauthenticated') return { state: { kind: 'idle' }, errors: null }
    if (error.code === 'csrf_failed') return { state: { kind: 'failed', reason: 'csrf' }, errors: null }
    if (error.code === 'payload_too_large') return { state: { kind: 'failed', reason: 'too-large' }, errors: null }
  }
  return { state: { kind: 'failed', reason: 'unexpected' }, errors: null }
}

/**
 * Runs one test of the form's check and classifies the outcome (FR-104 to FR-106). It saves
 * nothing and touches no cache. The `422` errors go to `onFieldErrors`; the form holds them.
 */
export function useTestCheck(onFieldErrors: (errors: readonly FieldError[]) => void) {
  const [state, setState] = useState<TestState>({ kind: 'idle' })
  // The state lags a render behind; this stops a second call in the same tick.
  const inFlight = useRef(false)
  const onScreen = useRef(false)
  const callback = useRef(onFieldErrors)
  useEffect(() => {
    callback.current = onFieldErrors
  })
  useEffect(() => {
    onScreen.current = true
    return () => {
      onScreen.current = false
    }
  }, [])

  /** Sends one test of `values`; does nothing while one is in flight. Resolves when the answer is handled. */
  const run = async (values: ServiceFormValues) => {
    if (inFlight.current) return
    inFlight.current = true
    const { type } = values
    setState({ kind: 'running' })
    try {
      const result = await testServiceCheck(toTestInput(values))
      if (onScreen.current) setState({ kind: 'result', result, type })
    } catch (error) {
      const outcome = classify(error)
      if (onScreen.current) {
        if (outcome.errors !== null) callback.current(outcome.errors)
        setState(outcome.state)
      }
    } finally {
      inFlight.current = false
    }
  }

  return {
    state,
    running: state.kind === 'running',
    run,
    /** The client checks failed: nothing is sent. */
    refuse: () => setState({ kind: 'refused' }),
  }
}
