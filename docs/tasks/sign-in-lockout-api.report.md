# Verification report: sign-in lockout API

Branch: `verify/sign-in-lockout-api` (verified commit: `feat/sign-in-lockout-api` at `f086b08`)

Result: **no Blocking findings.** One test gap was closed by the verifier (three rows added to `auth_test.go`). Everything else is Non-blocking.

## Commands run

| Command | Result |
|---|---|
| `make check` | **run, failed** at `test-frontend`, for a reason unrelated to this diff (see finding N5). Before that point `lint` (golangci-lint "0 issues", ESLint, stylelint, markdownlint) and every Go package passed with `-race`. |
| `make openapi-lint`, `make build` | run separately, because `make check` stops before them: both passed. |
| `npx vitest run --testTimeout=60000` in `frontend/` | run, passed (exit 0). The diff has no `frontend/` change. |
| `go test -race ./...` and `golangci-lint` after the verifier's test rows | run, passed (final run below the findings). |
| `make test-integration` | **not run**: the task touches no code that has integration tests. The only integration-tagged file is `adaptor/mailer/mailer_integration_test.go`. No criterion depends on it; every criterion below is covered by a unit test. |

## Acceptance criteria

"Real?" says whether the named test fails if the behavior is removed. Where I ran a mutation, its number is in brackets (see "Mutation checks").

### Lockout store (`memstore/lockout_test.go`)

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| 1 | New store not locked, first `Attempt` calls `matches` | `TestLockout_NewStoreIsNotLocked` | Yes: fails if the store starts locked. It passes if the lockout were removed altogether; the other rows cover that. | Met |
| 2 | Four failures do not lock; the fifth still calls `matches` (FR-2) | `TestLockout_FourFailuresDoNotLock` | Yes [M11] | Met |
| 3 | Fifth failure answered `matched=false, locked=false`; sixth locked, `wait` = 15 min, `matches` not called | `TestLockout_FifthFailureLocksTheSixthAttempt` (and the `fail` helper) | Yes [M7, M11] | Met |
| 4 | Locked refuses a matching attempt, `matches` not called (FR-2) | `TestLockout_RefusesCorrectCredentialsWhileLocked` | Yes [M7] | Met |
| 5 | `wait` is the time left | `TestLockout_WaitIsTheTimeLeft` | Yes [M3] | Met |
| 6 | Boundary: 1 ns before the end locked (`wait` 1 ns); exactly at the end unlocked | `TestLockout_LockEndsExactlyAtTheDuration` | Yes, both sides [M4a, M4b] | Met |
| 7 | A refused attempt does not extend the lock | `TestLockout_RefusedAttemptDoesNotExtendTheLock` | Yes [M3] | Met |
| 8 | After the lock ends the count is 0 | `TestLockout_CountIsZeroAfterTheLockEnds` | Yes [M4a, M10] | Met |
| 9 | A match resets the count; same sequence without it locks one earlier (FR-2) | `TestLockout_MatchResetsTheCount` (two subtests) | Yes [M2] | Met |
| 10 | A match on a fresh store | `TestLockout_MatchOnFreshStore` | Yes (fails if `matched` is wrong or the store locks) | Met |
| 11 | Other values: max 1, 1 minute | `TestLockout_OtherValues` | Yes: a hardcoded 5 or 15 min fails [M9, M12] | Met |
| 12 | 50 concurrent goroutines: exactly 5 `matches`, 45 locked, `-race` | `TestLockout_ConcurrentAttempts` | Yes **under `-race`** [M6a]. Without `-race` it passed with the mutex removed [M6b] (N3). | Met |
| 13 | Store imports neither `usecase`, `handler` nor `repository` | by reading | n/a | Met: imports are `sync`, `time`, `pkg/clock` only |

### Auth usecase (`usecase/auth_test.go`)

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| 14 | Existing `sign-in-api` criteria unchanged | existing tests | Yes. Only the constructor call changed; the added `attempts` assertions are additive. | Met |
| 15 | Mismatch rows call `Attempt` once and return `ErrInvalidCredentials`; a match calls it once | `TestAuthSignIn_RejectsMismatches`, `TestAuthSignIn_CreatesSession` | Yes [M1: password-only comparison fails the three wrong-username rows] | Met |
| 16 | Locked, `wait` 900 s: `SignInLockedError{900}`, right and wrong credentials, nothing stored | `TestAuthSignIn_Locked` | Yes for the error and for "nothing stored" [M13]. The assertion "`matches` was not run" cannot fail from a usecase change, because the fake decides it (N2). The store tests prove it (#3, #4). | Met |
| 17 | Rounding: 899.5→900, 900→900, 1.5→2, 500 ms→1, 1 ns→1 | `TestAuthSignIn_LockedRoundsUp` | **Partly.** These five rows kill round-down [M5a] but pass for round-half-up [M5c] and for a ceiling with no floor of 1 [M5b]. The verifier added three rows (1.1 s→2, 899.1 s→900, 0→1); both mutants now fail. | Met (after added rows) |
| 18 | No attempt for HTTPS-refused and empty-field requests, also when scripted `locked` | `TestAuthSignIn_NoAttemptForEarlierRefusals` (8 cases plus a baseline that does attempt) | Yes [M8] | Met |
| 19 | HTTPS on, HTTPS request, locked → `SignInLockedError` | `TestAuthSignIn_LockedOverHTTPS` | Yes [M13] | Met |

### Handler (`handler/session_test.go`, all through `AssertConforms`)

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| 20 | `SignInLockedError{292}` → 429, `application/problem+json`, `Retry-After: 292`, exact body, no detail/errors (FR-2) | `TestSignIn_Locked` | Yes [M14, M17] | Met |
| 21 | Wrapped error gives the same response | `TestSignIn_LockedWrapped` | Yes [M16: plain type assertion fails it] | Met |
| 22 | `Retry-After` 1 and 900 pass through | `TestSignIn_LockedRetryAfterPassesThrough` | Yes [M14] | Met |
| 23 | Body and headers carry neither username nor password (FR-1) | `TestSignIn_Locked` | Yes for the handler's own output. The handler cannot see which credential was wrong, so this is a regression guard. | Met |
| 24 | No `Set-Cookie` on the 429 | `TestSignIn_Locked` | Yes (fails if a cookie is set) | Met |
| 25 | One log line `sign-in locked`, no attributes; the 401 line is still `sign-in failed` | `TestSignIn_LockedLog` (whole line anchored by regexp) | Yes [M15] | Met |
| 26 | Existing 200, 401, 403, 422, 400, 413, 415 tests unchanged | existing tests | Yes | Met |

### Repo-wide

| # | Criterion | Evidence | Status |
|---|---|---|---|
| 27 | `make check` passes | Backend, lint, contract lint and build pass. The target as a whole exited 2 on four 5 s frontend timeouts (N5); the same frontend suite passes with a 60 s timeout. | **Partly met** (not caused by this diff) |
| 28 | Nothing outside the allowed paths changed; `go.mod`, `go.sum`, `.env.example`, `limits.go` unchanged | `git diff --name-only origin/main...HEAD`: 9 allowed backend files and the plan file | Met |

## Plan check

I read the plan after the table above.

- **Every criterion is in the plan.** All 28 map to a plan item; none is missing.
- **Every ticked item has a test that exists.** One name differs: the plan says `TestSignIn_LockedRetryAfterPassThrough`, the file has `TestSignIn_LockedRetryAfterPassesThrough` (cosmetic).
- **Ticked items whose test does not check the behavior:** "`matches` not run" under "Locked with wait 900 s" is ticked against `TestAuthSignIn_Locked`, but that assertion is decided by the fake (N2). The behavior is proven by `memstore` tests.
- **"`make check` passes: run, passed"** does not match what I saw: it exited 2 on frontend timeouts (N5). The builder's run may have been on a quieter machine.
- **Plan versus diff:** no difference. The plan's judgment calls (429 branch before the generic error branch; fake fields as plain package fields) match the code. The plan says the builder ran no mutation checks; that is consistent with the test gap in #17.
- **Judged against the task file, not the plan:** the code follows the task file's order of checks, rounding rule and boundary rule.

## Rule checks

| Rule | Result |
|---|---|
| Atomicity (`memstore/lockout.go`) | Pass. `Lock` and `defer Unlock` are the first two lines of `Attempt`; the lock check, `matches()` and the count update all run under it; no early unlock. A throwaway test confirmed a panic in `matches` does not leave the mutex held. |
| Constant-time comparison (`usecase/auth.go`) | Pass. Inside the function passed to `Attempt`, `equalDigest(username, …)` and `equalDigest(password, …)` both run on every call, with no return between them, combined as `userOK&passOK == 1`. `equalDigest` hashes with SHA-256 and uses `subtle.ConstantTimeCompare`. No `==` or `bytes.Equal` on a credential. |
| Counting rule in one place | Pass. No literal 5, 15 or 900 in `memstore/lockout.go`, `usecase/auth.go` or `handler/session.go`. `main.go` passes `domain.MaxFailedSignIns` and `domain.SignInLockout`. The fake lockout has no counting. |
| Wiring (`cmd/server/main.go`) | Pass. One `memstore.NewLockout(clock.Real{}, domain.MaxFailedSignIns, domain.SignInLockout)`, passed after `sessions`, before the clock. The diff is those two lines only. |
| Nothing stored (FR-114, CONVENTIONS rule 12) | Pass. No file under `migration/` or `repository/` changed; `lockout.go` imports no database or ORM package. A real restart cleared the lock (live run). |
| Time | Pass. No `time.Now`, `Sleep`, `After`, `NewTimer` or `Tick` in the non-test diff. Tests use `clock.Fake`. |
| Logging (CONVENTIONS "Logging") | Pass. The one new log call is `s.log.Warn("sign-in locked")`, in `handler/`, with no attributes. In the live run the log had three `sign-in locked` lines and no credential text. |
| Layering | Pass. `memstore` imports no `usecase` or `handler`. `usecase/auth.go` imports `domain` and the standard library only. Tests keep the same direction (the usecase test uses `fakeLockout`, not `memstore`). |
| Contract | Pass. `signIn` lists `429` with `Retry-After` (integer, minimum 1). `AssertConforms` runs on every 429 test. |
| Dependencies | Pass. `go.mod`, `go.sum` unchanged; nothing added. |
| Errors (CONVENTIONS "Errors") | Pass. The usecase returns the sentinel type `domain.SignInLockedError`; the handler maps it by `errors.As`. |
| Stored limits (rule 6) | Pass. Fixed limits are the existing `domain` constants. No config key added. |

## Mutation checks run

Each: break the source, run the named tests, confirm failure, revert (`git status` clean afterwards except my test rows).

| # | Break | Result |
|---|---|---|
| M1 | Compare the password only (a wrong username would match) | Failed: `TestAuthSignIn_RejectsMismatches` (3 wrong-username rows) |
| M2 | Do not reset the count on a match | Failed: `TestLockout_MatchResetsTheCount` |
| M3 | A refused attempt extends the lock | Failed: `RefusedAttemptDoesNotExtendTheLock`, `LockEndsExactlyAtTheDuration`, `WaitIsTheTimeLeft`, `OtherValues` |
| M4a | Lock ends one step late (`!now.After(end)`) | Failed: `LockEndsExactlyAtTheDuration` and 3 more |
| M4b | Lock ends one step early | Failed: `LockEndsExactlyAtTheDuration`, `OtherValues` |
| M5a | Round `wait` down (keeping the floor of 1) | Failed: rows 899.5 s and 1.5 s. The 1 ns row does **not** fail, because the floor of 1 hides it. The task text expects it to. |
| M5b | Ceiling without the floor of 1 | **Survived** the builder's rows; fails the added 0→1 row |
| M5c | Round half up | **Survived** the builder's rows; fails the added 1.1 s and 899.1 s rows |
| M6a | Remove the mutex, `-race` | Failed: `TestLockout_ConcurrentAttempts` (data race) |
| M6b | Remove the mutex, no `-race` | **Survived** (passed). Atomicity is proven only under `-race`, as the task says. |
| M7 | Call `matches` while locked | Failed: 4 store tests incl. `RefusesCorrectCredentialsWhileLocked` |
| M8 | Usecase counts a 422 request | Failed: 6 `NoAttemptForEarlierRefusals` cases |
| M9 | Store ignores `maxFailures` (hardcoded 5) | Failed: `OtherValues` |
| M10 | Count not reset when the lock starts | Failed: `CountIsZeroAfterTheLockEnds` |
| M11 | Lock one failure early | Failed: 12 store tests |
| M12 | Hardcoded 15 min in the store | Failed: `OtherValues` |
| M13 | Usecase ignores `locked` | Failed: `Locked`, `LockedRoundsUp`, `LockedOverHTTPS` |
| M14 | Handler sends `Retry-After: 0` | Failed: `Locked`, `LockedWrapped`, `LockedRetryAfterPassesThrough` |
| M15 | Handler logs an attribute | Failed: `TestSignIn_LockedLog` |
| M16 | Handler uses a type assertion, not `errors.As` | Failed: `TestSignIn_LockedWrapped` |
| M17 | Handler returns the wrong `code` | Failed: `Locked`, `LockedWrapped` |

## Live run of the built app

I built `cmd/server` and ran it on `127.0.0.1:18417` with `REQUIRE_HTTPS=false`, a temp SQLite file, and admin `admin` with a test password. I stopped each instance by its own PID and confirmed the port was free afterwards.

| What I sent | What I got |
|---|---|
| 4 wrong, 1 right, 4 wrong, 1 right | `401` ×4, `200` + cookie, `401` ×4, `200` + cookie: the match resets the count, no lock |
| 5 wrong **usernames** with the right password | `401` ×5: wrong username counts like a wrong password |
| Then the right credentials; wrong credentials | `429 sign_in_locked`, `Retry-After: 900`, no cookie, body `{"code","status","title"}` only; the same for both |
| Empty username while locked; empty password while locked | `422 validation_failed` (the lock does not change what a malformed request gets) |
| Malformed JSON; `text/plain` while locked | `400 malformed_request`; `415` |
| The right credentials about 2 s later | `429`, `Retry-After: 898` |
| `GET /health` while locked | `200` |
| Restart the binary, then the right credentials | `200`: a restart clears the lock (FR-114) |
| 40 parallel wrong attempts on a fresh instance | exactly five `401` and 35 `429` |
| `REQUIRE_HTTPS=true`, `TRUST_PROXY=true`: five wrong over `X-Forwarded-Proto: https`, then right credentials over https | `429` |
| The same account locked: right credentials over plain http; empty field over plain http | `403 https_required`; `403` (the scheme check comes first and is not an attempt) |

I did not wait out the real 15 minutes; the boundary is covered with the fake clock (#6).

## Findings

### Blocking

None.

### Non-blocking

- **N1 (test quality, fixed here).** The task's rounding rows (899.5, 900, 1.5, 0.5, 1 ns) could not tell a ceiling from round-half-up, and nothing exercised the `max(seconds, 1)` floor. I added three rows to `TestAuthSignIn_LockedRoundsUp` (1.1 s→2, 899.1 s→900, 0→1); both surviving mutants now fail. Matters when: someone "simplifies" the rounding, or a store ever returns `locked` with `wait` 0, which would send `Retry-After: 0` against the contract's minimum of 1.
- **N2 (test quality).** `assert.Zero(t, a.lockout.compared)` in `TestAuthSignIn_Locked` is decided by the fake, not by `SignIn`, and the plan counts it as the proof that `matches` is not run. The store tests are the real proof. Matters when: a refactor compares the credentials outside `Attempt` (for example, to log which one was wrong); no usecase test would notice.
- **N3 (test quality).** `TestLockout_ConcurrentAttempts` detects a missing mutex only under `-race` (M6b). `make test-backend` and CI use `-race`. Report only: it matters only if someone runs the package without the flag.
- **N4 (test quality).** "A panic in `matches` does not leave the mutex held" is specified but has no committed test. A throwaway test passed; I did not commit it, because a failing version would hang rather than fail, and the rules forbid real timers in `memstore` tests. Matters when: someone replaces `defer l.mu.Unlock()` with an explicit unlock.
- **N5 (latent bug, test quality; not this diff).** On this machine `make check` fails at `test-frontend` with four 5 s timeouts in `AddServiceForm.test.tsx` (3) and `App.test.tsx` (1). Both files pass alone and in a full run with `--testTimeout=60000`. Both are the files the parallel task `frontend-test-hardening` is shortening. Matters when: `make check` runs on a loaded machine; it can look like a red build on this branch. Owned by `frontend-test-hardening`.
- **N6 (cosmetic).** The plan names `TestSignIn_LockedRetryAfterPassThrough`; the test is `TestSignIn_LockedRetryAfterPassesThrough`. Report only.

## Docs or specs that no longer match

None.

- `docs/openapi.yaml` already lists the `signIn` 429 with `Retry-After` and the `sign_in_locked` code; the implementation matches it (checked by `AssertConforms` and the live run).
- `STACK.md` ("Sign-in lockout: hand-rolled, per account, in memory, injected clock") and `ARCHITECTURE.md` (`memstore/` holds lockouts) already describe this work.
- `docs/tasks/backlog.md`: the FR-2 row (end-to-end journey left for milestone 5) is still accurate.
- No dependency was added or changed, so there is no version to record in `STACK.md`.
- Task file nit, for the drafter: the mutation list says rounding down must fail "the 899.5 s and 1 ns rows". With the specified floor of 1, the 1 ns row passes under round-down; only 899.5 s and 1.5 s fail.
