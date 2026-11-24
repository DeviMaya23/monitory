import { useCallback, useRef, useState, type BaseSyntheticEvent } from "react";
import { useForm } from "react-hook-form";
import { ApiError } from "../../../lib/api/ApiError";
import {
  signIn,
  type SessionInfo,
  type SignInRequest,
} from "../../../lib/api/session";

/** How the last submit failed. A new object for every failure, so a repeat of the same kind is still a change. */
export type SignInFailure =
  | { kind: "invalid-credentials" }
  | { kind: "https-required"; detail: string | null }
  | { kind: "unexpected" }
  | { kind: "locked"; seconds: number };

function toFailure(error: unknown): SignInFailure {
  if (error instanceof ApiError && error.code === "invalid_credentials")
    return { kind: "invalid-credentials" };
  if (error instanceof ApiError && error.code === "https_required") {
    return { kind: "https-required", detail: error.problem?.detail || null };
  }
  if (
    error instanceof ApiError &&
    error.status === 429 &&
    error.code === "sign_in_locked" &&
    error.retryAfter !== null &&
    error.retryAfter >= 1
  ) {
    return { kind: "locked", seconds: error.retryAfter };
  }
  return { kind: "unexpected" };
}

/** Submits the sign-in form and turns each outcome into one of the screen's states. */
export function useSignIn(onSignedIn: (info: SessionInfo) => void) {
  const { register, handleSubmit, setValue } = useForm<SignInRequest>({
    defaultValues: { username: "", password: "" },
  });
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  const lastSubmitted = useRef<SignInRequest | null>(null);

  const clearFailure = useCallback(() => setFailure(null), []);

  const attempt = async (credentials: SignInRequest) => {
    lastSubmitted.current = credentials;
    setFailure(null);
    setSubmitting(true);
    try {
      const info = await signIn(credentials);
      onSignedIn(info);
    } catch (error) {
      const next = toFailure(error);
      if (next.kind === "invalid-credentials") setValue("password", "");
      setFailure(next);
    } finally {
      setSubmitting(false);
    }
  };

  return {
    register,
    submitting,
    failure,
    /** The form's `onSubmit`. An empty required field sends nothing and focuses that field. */
    submit: (event?: BaseSyntheticEvent) => {
      // While the lock shows, nothing is sent, however the submit came.
      if (failure?.kind === "locked") {
        event?.preventDefault();
        return Promise.resolve();
      }
      return handleSubmit(attempt)(event);
    },
    /** Submits the last username and password again. */
    retry: () => {
      if (failure?.kind === "locked") return;
      if (lastSubmitted.current) void attempt(lastSubmitted.current);
    },
    /** Removes the failure, for example when a lock's countdown ends. Stable across renders. */
    clearFailure,
  };
}
