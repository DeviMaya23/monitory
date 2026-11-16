import { useRef, useState, type BaseSyntheticEvent } from 'react'
import { useForm } from 'react-hook-form'
import { ApiError } from '../../../lib/api/ApiError'
import { signIn, type SessionInfo, type SignInRequest } from '../../../lib/api/session'

/** How the last submit failed. A new object for every failure, so a repeat of the same kind is still a change. */
export type SignInFailure =
  | { kind: 'invalid-credentials' }
  | { kind: 'https-required'; detail: string | null }
  | { kind: 'unexpected' }

function toFailure(error: unknown): SignInFailure {
  if (error instanceof ApiError && error.code === 'invalid_credentials') return { kind: 'invalid-credentials' }
  if (error instanceof ApiError && error.code === 'https_required') {
    return { kind: 'https-required', detail: error.problem?.detail || null }
  }
  return { kind: 'unexpected' }
}

/** Submits the sign-in form and turns each outcome into one of the screen's states. */
export function useSignIn(onSignedIn: (info: SessionInfo) => void) {
  const { register, handleSubmit, setValue } = useForm<SignInRequest>({
    defaultValues: { username: '', password: '' },
  })
  const [submitting, setSubmitting] = useState(false)
  const [failure, setFailure] = useState<SignInFailure | null>(null)
  const lastSubmitted = useRef<SignInRequest | null>(null)

  const attempt = async (credentials: SignInRequest) => {
    lastSubmitted.current = credentials
    setFailure(null)
    setSubmitting(true)
    try {
      const info = await signIn(credentials)
      onSignedIn(info)
    } catch (error) {
      const next = toFailure(error)
      if (next.kind === 'invalid-credentials') setValue('password', '')
      setFailure(next)
    } finally {
      setSubmitting(false)
    }
  }

  return {
    register,
    submitting,
    failure,
    /** The form's `onSubmit`. An empty required field sends nothing and focuses that field. */
    submit: (event?: BaseSyntheticEvent) => handleSubmit(attempt)(event),
    /** Submits the last username and password again. */
    retry: () => {
      if (lastSubmitted.current) void attempt(lastSubmitted.current)
    },
  }
}
