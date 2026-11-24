# Task: sign-in lockout API

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

After 5 failed sign-ins in a row, `signIn` refuses every further attempt for 15 minutes, even with the correct credentials, with `429 sign_in_locked` and a `Retry-After` header that says how many seconds are left. A correct sign-in resets the count. The count and the lock live in memory only, so a restart clears them (FR-114). After this task the contract's `signIn` produces every response it lists.

Requirements covered:

- FR-2: 5 failed attempts in a row lock the account for 15 minutes; the correct password is refused while locked; a correct sign-in resets the count.
- FR-1, in part: a locked response gives no hint about which credential was wrong, and the credential comparison stays constant-time and always compares both (`CONVENTIONS.md`, rule 16).
- FR-114: the count and the lock are never stored and start empty.

Out of scope:

- The locked state of the sign-in screen and its countdown. A separate task, `sign-in-locked-screen`, builds it against a mock of this response.
- End-to-end journeys for the lockout, including that a restart clears it. They belong to the milestone 5 end-to-end task (`m5-e2e-journeys`, not drafted yet), as the backlog's row for FR-2 says.
- A configuration key for the 5 or the 15 minutes. The user decided on constants: `domain.MaxFailedSignIns` and `domain.SignInLockout` already exist in `backend/internal/domain/limits.go` and are not used yet. `.env.example` and `platform/config` do not change.
- Locking by client address. FR-2 counts per account, and there is one account.
- Any change to the session store, the gate, the CSRF check, the policy router or `getSession` and `signOut`.
- Any change to the contract, a migration or the frontend.

## Prerequisite

All merged on the default branch (they are today). The builder checks the names and stops to ask if one is missing:

- `usecase.AuthService`, `usecase.NewAuthService`, `usecase.SessionStore`, `usecase.Clock` in `usecase/auth.go` and `usecase/clock.go`.
- `domain.MaxFailedSignIns` (5) and `domain.SignInLockout` (15 minutes) in `domain/limits.go`.
- `domain.RateLimitedError` in `domain/errors.go` (the example this task follows).
- `memstore.RateLimiter` and `memstore.Sessions`, built on `pkg/clock.Clock`, and `clock.Fake`.
- The generated `api.SignIn429ApplicationProblemPlusJSONResponse` (fields `Body api.Problem`, `Headers api.SignIn429ResponseHeaders{RetryAfter *int}`) and `api.ProblemCodeSignInLocked`.
- `handler.AuthService`, `handler.Server.SignIn` and `authSpy` in `handler/helpers_test.go`.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/domain/errors.go`;
- `backend/internal/memstore/lockout.go` and `lockout_test.go` (new);
- `backend/internal/usecase/auth.go`, `auth_test.go`, `fakes_test.go`;
- `backend/internal/handler/session.go`, `session_test.go`;
- `backend/cmd/server/main.go`.

You may not change `backend/internal/api/**` (generated), `backend/migration/**`, `backend/internal/platform/**`, the rest of `domain/` (`limits.go` included), `handler/problem.go`, `handler/server.go`, `handler/helpers_test.go`, `backend/go.mod`, `backend/go.sum`, `frontend/**`, `e2e/**`, `docs/**` (except your own plan file, `docs/tasks/sign-in-lockout-api.plan.md`), `.env.example`, `ARCHITECTURE.md`, `CONVENTIONS.md` or the `Makefile`. No configuration key and no migration is added. The `handler.AuthService` interface does not change (`SignIn` keeps its signature), so `server.go` and the shared test router stay as they are.

Shared files this task touches, owned by this task while it runs: `cmd/server/main.go`, `usecase/fakes_test.go`, `domain/errors.go`.

Tasks that may run at the same time: `m4-e2e-journeys` (changes `e2e/**` only) and two frontend tasks planned with this one, `sign-in-locked-screen` and `frontend-test-hardening` (frontend only; their files may not exist yet when this one is built, and neither shares a file with this task). No other backend task runs beside this one.

## Operations used

From `docs/openapi.yaml`:

| Operation | Method and path | Access | Change in this task |
|---|---|---|---|
| `signIn` | `POST /api/session` | public | Produces `429 sign_in_locked` with `Retry-After`. The responses it already produces (200, 400, 401, 403, 413, 415, 422, 500) do not change. |

The contract lists for the 429: description "Too many failed attempts (`sign_in_locked`)", the header `Retry-After` (integer, minimum 1, "Seconds to wait before trying again"), content `application/problem+json` with the `Problem` schema and the example `{ title: Sign-in locked, status: 429, code: sign_in_locked }`. The task specifies nothing beyond that: no `detail`, no `errors`, no other header. `getSession` and `signOut` do not change.

## Behavior

### What exists and what this task changes

- `usecase.AuthService.SignIn(ctx, username, password, https)` checks, in this order: HTTPS (403), required fields (422), credentials (401), then creates a session. It has no lockout; `handler.SignIn` maps `ErrInvalidCredentials` to 401 through `handler/problem.go` and logs `sign-in failed`.
- This task inserts the lockout into step 3 and adds a 429 path. The router's checks (size, content type, missing body, the generated binder's 400) still run first and are not touched.

### Order of checks in `signIn`

1. HTTPS (`403 https_required`): unchanged. It runs before the lockout and does not count as an attempt. A locked account that is asked over plain HTTP with "require HTTPS" on gets the 403.
2. Required fields (`422 validation_failed`): unchanged. An empty field is not an attempt: it is not counted and does not reset the count. While the account is locked, a request with an empty field still gets the 422; the lock does not change what a malformed request gets.
3. Lockout and credentials, one atomic step (below). Locked: `429 sign_in_locked`. Not locked: the credentials are compared; a mismatch is `401 invalid_credentials` and counts as a failed attempt; a match resets the count and a session is created as today.

### What counts

- A **failed attempt** is a request that reaches step 3 while the account is not locked and whose credentials do not match: wrong username, wrong password or both. One counter serves the single account; a wrong username counts like a wrong password (the user decided this; the requirements accept that anyone can lock the admin out, section 7).
- A request refused with `403`, `422`, `400`, `413`, `415` or `429` never counts and never resets the count.
- A **correct sign-in** (credentials match, account not locked) sets the count to 0.

### The lockout store (`memstore.Lockout`)

In memory only, empty at every start (FR-114), safe for concurrent use, built on `clock.Clock`. State: the number of failed attempts in a row (starts at 0) and the time the lock ends (none at start).

`Attempt(matches func() bool) (matched, locked bool, wait time.Duration)` does the following under one lock, so that two concurrent requests are never both let through past the limit:

1. If a lock is running (the clock is **before** the time it ends): return `matched=false`, `locked=true`, `wait` = the time left (greater than 0). `matches` is not called. The count and the end of the lock do not change: a refused attempt neither counts nor extends the lock.
2. Otherwise call `matches()`.
   - If it returns true: set the count to 0; return `matched=true`, `locked=false`, `wait=0`.
   - If it returns false: add 1 to the count. If the count is now equal to the maximum, set the end of the lock to now plus the lock duration and set the count back to 0. Return `matched=false`, `locked=false`, `wait=0`. The attempt that reaches the maximum is itself still answered `401`; the next one is the first `429`.

At exactly the end of the lock the account is no longer locked (`!now.Before(end)`), and the count is 0 then, so after a lock ends the admin gets 5 new failed attempts before the next lock. An attempt made one nanosecond before the end is still refused.

`matches` is called while the store's lock is held; it must be quick and must not call the store. The mutex is released with `defer`, so a panic in `matches` does not leave it held.

Both constructor values must be positive. The constructor does not check them: `main.go` passes the two constants, and no behavior is specified (or tested) for zero or negative values.

The constructor `memstore.NewLockout(clock clock.Clock, maxFailures int, duration time.Duration) *Lockout` takes both values as arguments, as `NewRateLimiter` does; `main.go` passes `domain.MaxFailedSignIns` and `domain.SignInLockout`. The store imports neither `usecase`, `handler` nor `repository`.

### The usecase

`usecase.AuthService` gets the store through a new interface defined in `usecase/auth.go`, beside `SessionStore`:

`usecase.Lockout` (new): `Attempt(matches func() bool) (matched, locked bool, wait time.Duration)`, as above.

`NewAuthService` gains one parameter, `lockout Lockout`, placed after `sessions` and before `clock`: `NewAuthService(username, password string, requireHTTPS bool, sessions SessionStore, lockout Lockout, clock Clock)`.

Step 3 becomes: call `lockout.Attempt` with a function that compares both credentials exactly as today (fixed-length digests, `crypto/subtle`, both always compared, the two results combined without a branch between them). Then:

- `locked`: return `domain.SignInLockedError{RetryAfterSeconds: n}`, with `n` = `wait` rounded **up** to whole seconds and never below 1 (`max(ceil(wait / 1s), 1)`), as `PublicViewService` rounds. No session is created.
- not `matched`: return `domain.ErrInvalidCredentials`.
- `matched`: create the session as today.

`domain/errors.go` gains `domain.SignInLockedError` (new): a struct with `RetryAfterSeconds int` (at least 1) that implements `error` with the text `sign-in locked`, beside `RateLimitedError`. It is a value type, found by `errors.As`.

Constant-time and the lock: the comparison still takes the same work whichever credential is wrong. When the account is locked the comparison is skipped; that the response then does not depend on the credentials is what the lock means.

### Retry-After by example (fixed clock, lock set by the 5th failure at time T)

| Clock | Response | `Retry-After` |
|---|---|---|
| T | 429 | 900 |
| T + 1 s | 429 | 899 |
| T + 14 min 59.5 s | 429 | 1 |
| T + 15 min | correct password: 200; wrong password: 401 | none |

Rounding rule, precisely: `wait` 900 s gives 900; 899.5 s gives 900; 0.5 s gives 1; 1 ns gives 1.

### The handler

`handler.SignIn`: when the error is a `domain.SignInLockedError` (found with `errors.As`), return `api.SignIn429ApplicationProblemPlusJSONResponse` with:

- `Body`: `newProblem(http.StatusTooManyRequests, api.ProblemCodeSignInLocked, "Sign-in locked")`: title `Sign-in locked`, status 429, code `sign_in_locked`, no `detail` and no `errors`;
- `Headers.RetryAfter`: a pointer to `RetryAfterSeconds`.

It logs one warning line with the message `sign-in locked` and no attributes at all, for each 429 (the existing `sign-in failed` line for each 401 stays). Nothing else is logged: no username, password, token, address or time. The response and the log do not depend on which credential was sent. `handler/problem.go` is not changed: the 429 is built in the handler, as `GetPublicDashboard` builds its own.

### Known gaps

- **One account, one counter.** The count is not keyed by username or by client address. Anyone who can reach the sign-in page can lock the admin out for 15 minutes at a time. Accepted for version 1 (requirements, section 7).
- **A lock cannot be lifted except by waiting or restarting the app** (FR-103, FR-114). There is no unlock operation.
- **No end-to-end proof here.** The seams are proven by unit tests (store, usecase, handler); no test in this task wires the three layers. The milestone 5 journeys prove "5 wrong attempts, then the right password is refused" through the real binary.
- **Existing end-to-end journeys** make at most two wrong sign-ins per app instance (`e2e/journeys/sign-in.spec.ts`), so none of them reaches the lock. This task does not run or change them.
- **Order of checks differs from "lockout first".** A request with an empty field gets 422 even while locked (see "Order of checks"). Decided by this file so that the check and the comparison can be one atomic step.

## Structure

By `ARCHITECTURE.md`. Names marked "new" do not exist yet and are fixed by this file; names this file does not give (unexported helpers, test doubles) are the builder's choice.

- `memstore/lockout.go` (new file): `memstore.Lockout`, `memstore.NewLockout` and its method `Attempt`. The criteria below need no other exported method.
- `usecase/auth.go`: the `Lockout` interface, the new constructor parameter, the new step 3. `AuthService` holds no mutable state of its own.
- `domain/errors.go`: `SignInLockedError`.
- `handler/session.go`: the 429 branch and its log line.
- `cmd/server/main.go`: build one `memstore.NewLockout(clock.Real{}, domain.MaxFailedSignIns, domain.SignInLockout)` and pass it to `usecase.NewAuthService` in the new position. No other line changes.
- `usecase/fakes_test.go`: a fake `usecase.Lockout`. By default it calls `matches()` once and reports `matched` as the result with `locked=false`; a test can script `locked` and `wait` instead, and the fake records how many times `matches` ran. It must not contain the counting rule (that is `memstore`'s and is tested there).

## Dependencies

None. The Go standard library and the packages already in `go.mod` cover it. `go.mod` and `go.sum` do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Store and usecase tests use `clock.Fake` and no `time.Sleep`. No integration test (build tag `integration`) is needed.

**Lockout store (`memstore/lockout_test.go`, built with `NewLockout(clock, domain.MaxFailedSignIns, domain.SignInLockout)`)**

- A new store is not locked: the first `Attempt` calls `matches` and returns `locked=false`.
- Four failing attempts in a row are not locked: the fifth `Attempt` still calls `matches` (FR-2).
- The fifth failing attempt returns `matched=false`, `locked=false`; the sixth returns `locked=true` with `wait` equal to `domain.SignInLockout` and does not call `matches` (counter on the function).
- While locked, an `Attempt` whose `matches` would return true is still refused, and `matches` is not called (FR-2, "even with correct credentials").
- `wait` is the time left: one second later it is `domain.SignInLockout - 1s`.
- Boundary: with the clock advanced to one nanosecond less than the lock duration since the fifth failure, `Attempt` is still locked (`wait` of 1 ns); advanced to exactly `domain.SignInLockout`, `Attempt` calls `matches` and is not locked.
- A refused attempt does not extend the lock: refuse an attempt at half the duration, then at exactly the duration after the fifth failure the account is unlocked.
- After the lock ends the count is 0: four more failures do not lock; a fifth does (FR-2, "in a row").
- A matching attempt after 4 failures resets the count: four more failures do not lock, the fifth does (FR-2). The same sequence without the match locks one attempt earlier, which shows the reset is what changed it.
- A matching attempt on a fresh store returns `matched=true` and leaves it unlocked.
- Other values: a store built with `maxFailures` 1 and a 1-minute duration locks after one failure and unlocks at exactly one minute.
- Concurrent: 50 goroutines call `Attempt` at the same time with a function that always fails; exactly 5 of them have `matches` called and the other 45 report `locked=true`, under the race detector. With the check and the count not atomic this fails.
- The store imports neither `usecase`, `handler` nor `repository` (checked by the verifier by reading).

**Auth usecase (`usecase/auth_test.go`, with the fake lockout)**

- With the default fake, the existing criteria of `sign-in-api` still pass unchanged in what they assert (correct credentials, the mismatch table, tokens, HTTPS, empty fields, sign-out). Only the constructor call changes.
- A mismatch (each row of the existing table) calls `Attempt` once and returns `ErrInvalidCredentials`; a match calls it once and returns a session.
- When the fake reports `locked` with `wait` 900 s, `SignIn` returns a `domain.SignInLockedError` with `RetryAfterSeconds` 900, found with `errors.As`, with correct credentials and with wrong ones, and `matches` was not run and nothing is stored (FR-2).
- Rounding, each row a separate case: `wait` 899.5 s gives 900; 900 s gives 900; 1.5 s gives 2; 500 ms gives 1; 1 ns gives 1 (never 0).
- No attempt for requests that stop earlier: with "require HTTPS" on and a plain-HTTP request, and with an empty username, an empty password and both, `Attempt` is not called and the right error is returned (`ErrHTTPSRequired`, `ValidationError`). With the fake scripted to `locked`, the same four requests still get those errors and not 429.
- With "require HTTPS" on and an HTTPS request that is locked: `SignInLockedError`.

**Handler (`handler/session_test.go`, with `authSpy`; every response passes `testutil.AssertConforms`)**

- A spy error of `domain.SignInLockedError{RetryAfterSeconds: 292}` gives 429, `Content-Type: application/problem+json`, header `Retry-After: 292`, body title `Sign-in locked`, status 429, code `sign_in_locked`, and no `detail` and no `errors` (FR-2).
- The same error wrapped (`fmt.Errorf("x: %w", err)`) gives the same response.
- `Retry-After: 1` and `Retry-After: 900` are passed through as the spy gave them.
- The response body and header contain neither the username nor the password that was sent (FR-1).
- The 429 response has no `Set-Cookie` header. (That no session is created is proven by the usecase test, not here.)
- The handler logs one line for the 429 whose message is `sign-in locked` and which has no attribute besides the `time` and `level` that the logger always adds (`level=WARN`); the line for a 401 is still `sign-in failed`. The test reads the router's captured log text, as `TestSignIn_InvalidCredentials` does, and asserts the whole line, for example with a regular expression anchored on `^time=\S+ level=WARN msg="sign-in locked"$`; no username, password or other text appears in it.
- The 200, 401, 403, 422, 400, 413 and 415 cases of the existing tests still pass unchanged.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `go.mod`, `go.sum`, `.env.example` and `domain/limits.go` are unchanged.

Tests this task changes on purpose: `usecase/auth_test.go` and `usecase/fakes_test.go` for the new constructor parameter (no assertion removed or loosened). No test in `handler/` needs its assertions changed.

## Verifier checks

- **Atomicity, by reading `memstore/lockout.go`:** the lock check, the call of `matches` and the count update happen under one mutex held for the whole call; there is no early unlock between them.
- **Constant-time comparison, by reading `usecase/auth.go`:** inside the function passed to `Attempt`, both the username and the password are compared on every call; there is no early return between them; `crypto/subtle` on fixed-length digests; no `==` or `bytes.Equal` on a credential.
- **Counting rule in one place:** the maximum and the duration appear only as `domain.MaxFailedSignIns` and `domain.SignInLockout` passed from `main.go`; no literal 5, 15 or 900 in `memstore/`, `usecase/` or `handler/` outside tests; the fake lockout contains no counting.
- **Wiring, by reading `cmd/server/main.go`:** one `Lockout` instance, built with the two domain constants and `clock.Real{}`, passed to `NewAuthService`; nothing else about sessions or the router changed.
- **Nothing stored:** no file under `backend/migration/` or `backend/internal/repository/` changed; `memstore/lockout.go` imports no database or ORM package (FR-114).
- **Time:** no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` in the diff outside `cmd/`.
- **Logging:** the only new log call is `sign-in locked` with no attributes; no username, password, token or address in any log call or error text.
- **Layering:** `memstore/` does not import `usecase` or `handler`; `usecase/` does not import `memstore`, `handler` or `internal/api`.
- **Contract:** every response `signIn` returns is listed in `docs/openapi.yaml`; the 429 has `Retry-After` as an integer of at least 1.
- **Mutation checks to run:** count only wrong passwords (a wrong-username sequence must fail the store or usecase test that exercises it); do not reset the count on a match (the reset test must fail); extend the lock on a refused attempt (the "does not extend" test must fail); treat the lock as ending one step late or early (both boundary tests must fail); round `wait` down (the 899.5 s and 1 ns rows must fail); drop the mutex (the concurrency test must fail under `-race`); call `matches` while locked (the call-counter tests must fail); make `Attempt` count a 422 request (the usecase "no attempt" test must fail).
- **Inputs to try, by reading the tests or by a small throwaway test:** five wrong passwords then the right one (429); five wrong, advance exactly 15 minutes, the right one (200); four wrong, the right one, four wrong (no lock); a wrong username five times (locks); an empty body field while locked (422); plain HTTP while locked with "require HTTPS" on (403).

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, a config key, or an edit to a spec file (the `handler.AuthService` interface and `domain/limits.go` included).
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.
- The generated `SignIn429ApplicationProblemPlusJSONResponse` cannot carry the header or the body as described.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), that no integration tests apply, that no dependency changed, and anything you were unsure about. Also list every judgment call this file did not settle.
