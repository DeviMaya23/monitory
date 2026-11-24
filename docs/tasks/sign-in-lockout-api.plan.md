# Plan: sign-in lockout API

Branch: feat/sign-in-lockout-api

## Lockout store: `backend/internal/memstore/lockout.go`, tests in `lockout_test.go`

- [ ] A new store is not locked: first `Attempt` calls `matches`, `locked=false` (`TestLockout_NewStoreIsNotLocked`)
- [ ] Four failures do not lock; the fifth still calls `matches` (`TestLockout_FourFailuresDoNotLock`)
- [ ] Fifth failure returns unmatched/unlocked; sixth is locked with `wait` = `SignInLockout`, `matches` not called (`TestLockout_FifthFailureLocksTheSixthAttempt`)
- [ ] Locked refuses a matching attempt without calling `matches` (`TestLockout_RefusesCorrectCredentialsWhileLocked`)
- [ ] `wait` is the time left (`TestLockout_WaitIsTheTimeLeft`)
- [ ] Boundary: 1 ns before the end still locked; exactly at the end unlocked (`TestLockout_LockEndsExactlyAtTheDuration`)
- [ ] A refused attempt does not extend the lock (`TestLockout_RefusedAttemptDoesNotExtendTheLock`)
- [ ] After the lock ends the count is 0 (`TestLockout_CountIsZeroAfterTheLockEnds`)
- [ ] A match resets the count; same sequence without the match locks one attempt earlier (`TestLockout_MatchResetsTheCount`)
- [ ] A match on a fresh store: matched, not locked (`TestLockout_MatchOnFreshStore`)
- [ ] Other values: max 1, 1 minute (`TestLockout_OtherValues`)
- [ ] Concurrent: 50 goroutines, exactly 5 `matches` calls, 45 locked, under `-race` (`TestLockout_ConcurrentAttempts`)
- [ ] Imports neither usecase, handler nor repository (by reading; verifier)

## Usecase: `usecase/auth.go`, `domain/errors.go`, tests in `usecase/auth_test.go`, fake in `usecase/fakes_test.go`

- [ ] Existing criteria still pass, only the constructor call changes (`auth_test.go`, existing tests)
- [ ] Mismatch rows call `Attempt` once and return `ErrInvalidCredentials`; a match calls it once and returns a session (`TestAuthSignIn_RejectsMismatches`, `TestAuthSignIn_CreatesSession`)
- [ ] Locked with `wait` 900 s: `SignInLockedError{900}`, right and wrong credentials, `matches` not run, nothing stored (`TestAuthSignIn_Locked`)
- [ ] Rounding rows: 899.5 s→900, 900 s→900, 1.5 s→2, 500 ms→1, 1 ns→1 (`TestAuthSignIn_LockedRoundsUp`)
- [ ] No attempt for HTTPS-refused and empty-field requests, also when the fake is scripted locked (`TestAuthSignIn_NoAttemptForEarlierRefusals`)
- [ ] HTTPS on with an HTTPS request that is locked: `SignInLockedError` (`TestAuthSignIn_LockedOverHTTPS`)
- [ ] `domain.SignInLockedError` added in `domain/errors.go`, text `sign-in locked`

## Handler: `handler/session.go`, tests in `handler/session_test.go`

- [ ] `SignInLockedError{292}` gives 429, `application/problem+json`, `Retry-After: 292`, title/status/code, no detail/errors, conforms (`TestSignIn_Locked`)
- [ ] Wrapped error gives the same response (`TestSignIn_LockedWrapped`)
- [ ] `Retry-After` 1 and 900 pass through (`TestSignIn_LockedRetryAfterPassThrough`)
- [ ] Body and header contain neither the username nor the password (`TestSignIn_Locked`)
- [ ] No `Set-Cookie` on the 429 (`TestSignIn_Locked`)
- [ ] One log line `sign-in locked`, no attributes, whole line asserted; the 401 line is still `sign-in failed` (`TestSignIn_LockedLog`)
- [ ] Existing 200, 401, 403, 422, 400, 413, 415 tests pass unchanged

## Wiring: `backend/cmd/server/main.go`

- [ ] One `memstore.NewLockout(clock.Real{}, domain.MaxFailedSignIns, domain.SignInLockout)` passed to `NewAuthService` after `sessions` (checked by build and by reading)

## Repo-wide

- [ ] `make check` passes
- [ ] Nothing outside the allowed paths changed; `go.mod`, `go.sum`, `.env.example`, `domain/limits.go` unchanged
- [ ] Integration tests: not run: the task touches no code with integration tests and needs none (no `integration` tag test in this task)

## Judgment calls

- `make check` first failed on the frontend lint because a fresh worktree has no `node_modules`; I ran `npm ci` in `frontend/` (ignored by git, no file tracked changed) and it then passed.
- The handler 429 branch runs before the generic `err != nil` branch and logs `sign-in locked` there, so the 401 path and its `sign-in failed` line are untouched.
- The fake lockout's `locked`, `wait`, `attempts` and `compared` fields are plain exported-to-package fields rather than a constructor; the task left its shape to the builder.
- The test helper `fail`/`lockedNow` in `lockout_test.go` and the `probe` type are my choice; `probe` counts calls of `matches`.
- The "wrong username counts" mutation check is covered at the seam: the usecase passes both credentials into one `matches` function, and `TestAuthSignIn_RejectsMismatches` shows each wrong-username row makes one attempt; the counting itself is store-side and does not look at which credential was wrong.
- No mutation checks were run by me; the verifier does them.
