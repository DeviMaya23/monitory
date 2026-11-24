import { useEffect, useRef } from "react";
import {
  Activity,
  CircleAlert,
  Info,
  LoaderCircle,
  Lock,
  RefreshCw,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import type { SessionInfo } from "../../../lib/api/session";
import { useLockCountdown } from "../hooks/useLockCountdown";
import { useSignIn } from "../hooks/useSignIn";
import { formatWait } from "../lib/formatWait";
import "../sign-in.css";

interface SignInFormProps {
  /** A session ended while the page was open: show the "session ended" notice. */
  sessionEnded: boolean;
  /** The session check failed: show the unexpected-error banner, with Retry rechecking. */
  unreachable: boolean;
  /** A recheck is in flight: the form cannot be used. */
  rechecking: boolean;
  onSignedIn: (info: SessionInfo) => void;
  onRecheck: () => void;
}

export function SignInForm({
  sessionEnded,
  unreachable,
  rechecking,
  onSignedIn,
  onRecheck,
}: SignInFormProps) {
  const { register, submitting, failure, submit, retry, clearFailure } =
    useSignIn(onSignedIn);
  const remaining = useLockCountdown(
    failure?.kind === "locked" ? failure : null,
    clearFailure,
  );
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const wasRechecking = useRef(false);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  // Focus follows the outcome of a submit.
  useEffect(() => {
    if (failure?.kind === "invalid-credentials") passwordRef.current?.focus();
    else if (failure?.kind === "https-required") submitRef.current?.focus();
    else if (failure?.kind === "unexpected") retryRef.current?.focus();
    else if (failure?.kind === "locked") passwordRef.current?.focus();
  }, [failure]);

  // Focus follows the end of a recheck.
  useEffect(() => {
    if (wasRechecking.current && !rechecking) {
      if (unreachable) retryRef.current?.focus();
      else usernameRef.current?.focus();
    }
    wasRechecking.current = rechecking;
  }, [rechecking, unreachable]);

  // react-hook-form owns each input's ref; ours sits beside it for focus.
  const usernameField = register("username", { required: true });
  const passwordField = register("password", { required: true });
  const locked = submitting || rechecking;
  const lockActive = failure?.kind === "locked" && remaining !== null;
  // Precedence: the last submit's failure, then an unreachable session, then the notice.
  const unexpected =
    failure?.kind === "unexpected" || (failure === null && unreachable);
  const onRetry = failure?.kind === "unexpected" ? retry : onRecheck;

  return (
    <main className="signin">
      <div className="signin__card">
        <div className="brand">
          <Activity className="icon" aria-hidden="true" />
          <span>Monitory</span>
        </div>
        <h1 className="signin__title">Sign in</h1>
        <div aria-live="polite" className="stack">
          {!submitting && failure?.kind === "invalid-credentials" && (
            <div className="banner banner--error" role="alert">
              <CircleAlert className="icon" aria-hidden="true" />
              <div className="banner__body">
                <span className="banner__title">
                  Username or password is incorrect.
                </span>
              </div>
            </div>
          )}
          {!submitting && failure?.kind === "https-required" && (
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
          {!submitting && failure?.kind === "locked" && remaining !== null && (
            <div className="banner banner--error" role="alert">
              <Lock className="icon" aria-hidden="true" />
              <div className="banner__body">
                <span className="banner__title">Too many failed attempts.</span>
                <span>
                  Try again in{" "}
                  <span className="signin__wait" aria-live="off">
                    {formatWait(remaining)}
                  </span>
                  .
                </span>
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
                <button
                  type="button"
                  className="btn"
                  ref={retryRef}
                  disabled={rechecking}
                  onClick={onRetry}
                >
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
              {...usernameField}
              ref={(el) => {
                usernameField.ref(el);
                usernameRef.current = el;
              }}
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
              {...passwordField}
              ref={(el) => {
                passwordField.ref(el);
                passwordRef.current = el;
              }}
            />
          </div>
          <button
            type="submit"
            className="btn btn--primary"
            ref={submitRef}
            disabled={locked || lockActive}
            aria-busy={submitting || undefined}
          >
            {submitting && (
              <LoaderCircle
                className="icon icon--sm spinner"
                aria-hidden="true"
              />
            )}
            <span>{submitting ? "Signing in…" : "Sign in"}</span>
          </button>
        </form>
      </div>
    </main>
  );
}
