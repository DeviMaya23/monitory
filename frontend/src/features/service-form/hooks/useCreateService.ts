import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../../lib/api/ApiError'
import {
  createService,
  servicesQueryKey,
  type FieldError,
  type HttpMethod,
  type Service,
} from '../../../lib/api/services'
import { requestParts, type BodyType } from '../lib/requestRows'

/** What the form sends: the values on this screen. The two messages are sent as typed. */
export type ServiceFormValues = {
  name: string
  method: HttpMethod
  url: string
  /** The query parameter and header rows, as typed. */
  query_params: { name: string; value: string }[]
  headers: { name: string; value: string }[]
  /** The body's type and text; the text is kept while the type is `none`, and not sent. */
  body_type: BodyType
  body_content: string
  alerts_enabled: boolean
  unhealthy_message: string
  recovery_message: string
  /** The four timing values, as typed (FR-41, FR-51, FR-53, FR-57). */
  check_interval: string
  timeout: string
  retries: string
  retry_interval: string
}

/** How the last save failed. A new object for every failure, so a repeat of the same kind is still a change. */
export type CreateFailure =
  | { kind: 'field-errors'; errors: readonly FieldError[] }
  | { kind: 'name-taken' }
  | { kind: 'limit' }
  | { kind: 'too-large' }
  | { kind: 'csrf' }
  | { kind: 'unexpected' }

/** The outcome of a failed request; null for a 401, which the shell handles by ending the session. */
function toFailure(error: unknown): CreateFailure | null {
  if (error instanceof ApiError) {
    const errors = error.problem?.errors
    if (error.status === 422 && error.code === 'validation_failed' && errors && errors.length > 0) {
      return { kind: 'field-errors', errors }
    }
    if (error.code === 'service_name_taken') return { kind: 'name-taken' }
    if (error.code === 'service_limit_reached') return { kind: 'limit' }
    if (error.code === 'payload_too_large') return { kind: 'too-large' }
    if (error.code === 'csrf_failed') return { kind: 'csrf' }
    if (error.status === 401 && error.code === 'unauthenticated') return null
  }
  return { kind: 'unexpected' }
}

/**
 * Sends `createService` and turns each response into one of the screen's outcomes. On a 201
 * the cached service list is dropped, and `onCreated` runs if the form is still on screen.
 */
export function useCreateService(onCreated: (service: Service) => void) {
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [failure, setFailure] = useState<CreateFailure | null>(null)
  // The state above lags a render behind; this stops a second submit in the same tick.
  const inFlight = useRef(false)
  const onScreen = useRef(false)

  useEffect(() => {
    onScreen.current = true
    return () => {
      onScreen.current = false
    }
  }, [])

  const submit = async ({
    name,
    method,
    url,
    query_params,
    headers,
    body_type,
    body_content,
    alerts_enabled,
    unhealthy_message,
    recovery_message,
    check_interval,
    timeout,
    retries,
    retry_interval,
  }: ServiceFormValues) => {
    if (inFlight.current) return
    inFlight.current = true
    setFailure(null)
    setSaving(true)
    try {
      const service = await createService({
        name,
        check: {
          type: 'http',
          method,
          url,
          ...requestParts({ query_params, headers, body_type, body_content }),
        },
        alerts_enabled,
        unhealthy_message,
        recovery_message,
        settings: {
          check_interval_seconds: Number(check_interval.trim()),
          timeout_seconds: Number(timeout.trim()),
          retry_count: Number(retries.trim()),
          retry_interval_seconds: Number(retry_interval.trim()),
        },
      })
      // The dashboard is not mounted here: without the entry it loads the fresh list.
      queryClient.removeQueries({ queryKey: servicesQueryKey })
      if (onScreen.current) {
        setSaved(true)
        onCreated(service)
      }
    } catch (error) {
      setFailure(toFailure(error))
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return {
    /** A request is in flight. */
    saving,
    /** The last request was answered 201. */
    saved,
    failure,
    /** Sends the values once; does nothing while a request is in flight. */
    submit,
    /** Drops the last failure (a new attempt starts, or the name was edited after `name-taken`). */
    clearFailure: () => setFailure(null),
  }
}
