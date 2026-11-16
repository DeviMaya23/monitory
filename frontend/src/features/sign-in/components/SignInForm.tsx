import { useEffect, useRef } from 'react'
import { Activity, CircleAlert, Info, LoaderCircle, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react'
import type { SessionInfo } from '../../../lib/api/session'
import { useSignIn } from '../hooks/useSignIn'
import '../sign-in.css'

interface SignInFormProps {
  /** A session ended while the page was open: show the "session ended" notice. */
  sessionEnded: boolean
  /** The session check failed: show the unexpected-error banner, with Retry rechecking. */
  unreachable: boolean
  /** A recheck is in flight: the form cannot be used. */
  rechecking: boolean
  onSignedIn: (info: SessionInfo) => void
  onRecheck: () => void
}

export function SignInForm({ sessionEnded, unreachable, rechecking, onSignedIn, onRecheck }: SignInFormProps) {
  const { register, setFocus, submitting, failure, submit, retry } = useSignIn(onSignedIn)
  const submitRef = useRef<HTMLButtonElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const wasRechecking = useRef(false)

  useEffect(() => {
    setFocus('username')
  }, [setFocus])

  // Focus follows the outcome of a submit.
  useEffect(() => {
    if (failure?.kind === 'invalid-credentials') setFocus('password')
    else if (failure?.kind === 'https-required') submitRef.current?.focus()
    else if (failure?.kind === 'unexpected') retryRef.current?.focus()
  }, [failure, setFocus])

  // Focus follows the end of a recheck.
  useEffect(() => {
    if (wasRechecking.current && !rechecking) {
      if (unreachable) retryRef.current?.focus()
      else setFocus('username')
    }
    wasRechecking.current = rechecking
  }, [rechecking, unreachable, setFocus])

  const locked = submitting || rechecking
  // Precedence: the last submit's failure, then an unreachable session, then the notice.
  const unexpected = failure?.kind === 'unexpected' || (failure === null && unreachable)
  const onRetry = failure?.kind === 'unexpected' ? retry : onRecheck

  return (
    <main className="signin">
      <div className="signin__card">
        <div className="brand">
          <Activity className="icon" aria-hidden="true" />
          <span>Monitory</span>
        </div>
        <h1 className="signin__title">Sign in</h1>
        <div aria-live="polite" className="stack">
          {!submitting && failure?.kind === 'invalid-credentials' && (
            <div className="banner banner--error" role="alert">
              <CircleAlert className="icon" aria-hidden="true" />
              <div className="banner__body">
                <span className="banner__title">Username or password is incorrect.</span>
              </div>
            </div>
          )}
          {!submitting && failure?.kind === 'https-required' && (
            <div className="banner banner--warn" role="alert">
              <TriangleAlert className="icon" aria-hidden="true" />
              <div className="banner__body">
                <span className="banner__title">Sign-in requires HTTPS</span>
                {failure.detail && (
                  <span>
                    <span className="signin__detail">{failure.detail}</span>
                  </span>
                )}
              </div>
            </div>
          )}
          {!submitting && unexpected && (
            <div className="banner banner--error" role="alert">
              <WifiOff className="icon" aria-hidden="true" />
              <div className="banner__body">
                <span className="banner__title">Can’t reach the server.</span>
                <span>Check your connection and try again.</span>
              </div>
              <div className="banner__actions">
                <button type="button" className="btn" ref={retryRef} disabled={rechecking} onClick={onRetry}>
                  <RefreshCw className="icon icon--sm" aria-hidden="true" />
                  <span>Retry</span>
                </button>
              </div>
            </div>
          )}
          {!submitting && failure === null && !unreachable && sessionEnded && (
            <div className="banner banner--info">
              <Info className="icon" aria-hidden="true" />
              <div className="banner__body">
                <span className="banner__title">Your session has ended.</span>
                <span>Sign in again to continue.</span>
              </div>
            </div>
          )}
        </div>
        <form className="signin__form" noValidate onSubmit={submit}>
          <div className="field">
            <label className="label" htmlFor="signin-username">
              Username
            </label>
            <input
              className="input"
              id="signin-username"
              autoComplete="username"
              disabled={locked}
              {...register('username', { required: true })}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="signin-password">
              Password
            </label>
            <input
              className="input"
              id="signin-password"
              type="password"
              autoComplete="current-password"
              disabled={locked}
              {...register('password', { required: true })}
            />
          </div>
          <button
            type="submit"
            className="btn btn--primary"
            ref={submitRef}
            disabled={locked}
            aria-busy={submitting || undefined}
          >
            {submitting && <LoaderCircle className="icon icon--sm spinner" aria-hidden="true" />}
            <span>{submitting ? 'Signing in…' : 'Sign in'}</span>
          </button>
        </form>
      </div>
    </main>
  )
}
