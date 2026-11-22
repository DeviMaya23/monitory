import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../lib/api/ApiError'
import { servicesQueryKey, type FieldError, type Service } from '../../../lib/api/services'
import type { ServiceFormValues } from '../lib/formValues'

/** How the last save failed. A new object for every failure, so a repeat of the same kind is still a change. */
export type SaveFailure =
  | { kind: 'field-errors'; errors: readonly FieldError[] }
  | { kind: 'name-taken' }
  | { kind: 'limit' }
  | { kind: 'too-large' }
  | { kind: 'csrf' }
  | { kind: 'not-found' }
  | { kind: 'unexpected' }

export type SaveMode = 'create' | 'update'

/**
 * The outcome of a failed request; null for a 401, which the shell handles by ending the session.
 * `createService` lists no 404 and `updateService` lists no `service_limit_reached`: each is then the generic failure.
 */
export function toFailure(error: unknown, mode: SaveMode): SaveFailure | null {
  if (error instanceof ApiError) {
    const errors = error.problem?.errors
    if (error.status === 422 && error.code === 'validation_failed' && errors && errors.length > 0) {
      return { kind: 'field-errors', errors }
    }
    if (error.code === 'service_name_taken') return { kind: 'name-taken' }
    if (mode === 'create' && error.code === 'service_limit_reached') return { kind: 'limit' }
    if (error.code === 'payload_too_large') return { kind: 'too-large' }
    if (error.code === 'csrf_failed') return { kind: 'csrf' }
    if (mode === 'update' && error.status === 404 && error.code === 'not_found') return { kind: 'not-found' }
    if (error.status === 401 && error.code === 'unauthenticated') return null
  }
  return { kind: 'unexpected' }
}

/**
 * The save state machine over a `send` function: the in-flight guard, the on-screen check, the
 * classification of a failure and the removal of the cached service list (the dashboard then
 * loads fresh). `onSaved` runs on a 200 only if the form is still on screen.
 */
export function useSaveService(
  mode: SaveMode,
  send: (values: ServiceFormValues) => Promise<Service>,
  onSaved: (service: Service) => void,
) {
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [failure, setFailure] = useState<SaveFailure | null>(null)
  // The state above lags a render behind; this stops a second submit in the same tick.
  const inFlight = useRef(false)
  const onScreen = useRef(false)

  useEffect(() => {
    onScreen.current = true
    return () => {
      onScreen.current = false
    }
  }, [])

  const dropList = () => queryClient.removeQueries({ queryKey: servicesQueryKey, exact: true })

  const submit = async (values: ServiceFormValues) => {
    if (inFlight.current) return
    inFlight.current = true
    setFailure(null)
    setSaving(true)
    try {
      const service = await send(values)
      dropList()
      if (onScreen.current) {
        setSaved(true)
        onSaved(service)
      }
    } catch (error) {
      const next = toFailure(error, mode)
      // The service is gone: the dashboard must load again.
      if (next?.kind === 'not-found') dropList()
      setFailure(next)
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return {
    /** A request is in flight. */
    saving,
    /** The last request was answered 200 or 201. */
    saved,
    failure,
    /** Sends the values once; does nothing while a request is in flight. */
    submit,
    /** Drops the last failure (a new attempt starts, or the name was edited after `name-taken`). */
    clearFailure: () => setFailure(null),
  }
}
