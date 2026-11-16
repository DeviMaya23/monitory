# Verification report: sign-in API

Verifier branch: `verify/sign-in-api` (reset onto `origin/feat/sign-in-api` at `b0d19db`).

**Result: no Blocking findings.** `make check` passes. No test and no source file was changed by the verifier; this report is the only addition.

`make check`: run, passed (lint 0 issues, openapi lint, Go tests with `-race`, frontend tests 30/30, builds). The checkout had no frontend dependencies, so `npm ci` was run first.

Integration tests: not run. No file in the repo carries the `integration` build tag, so `make test-integration` (Docker, Mailpit) has nothing to run for this task, and no criterion depends only on one. Every criterion is covered by unit tests, which `make check` ran.

## Criteria

"Real?" asks whether the named test fails if the behaviour is removed. "Yes (mutated)" means I broke the source and watched it fail (see Mutation checks). "Yes (by reading)" means I read the assertion and the behaviour cannot be removed without failing it.

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| S1 | New store knows no session (FR-114) | `TestSessions_NewStoreIsEmpty` | Weak: only fails if the constructor pre-fills; the real guarantee is that nothing is written to disk, shown by reading (no `repository`/`gorm` import) | Met |
| S2 | Found by token with token, CSRF, `ExpiresAt`; unknown and empty token not found | `TestSessions_FindByToken` | Yes (by reading; compares the whole struct) | Met |
| S3 | Found 1 s before `ExpiresAt`, not at exactly `ExpiresAt` (FR-5) | `TestSessions_ExpiresAtBoundary` | Yes (mutated) | Met |
| S4 | Lookups never change `ExpiresAt` (FR-5) | `TestSessions_LookupDoesNotExtend` | Yes (by reading; 5 lookups, each compared to the original) | Met |
| S5 | Deleted not found, neighbour stays (FR-3) | `TestSessions_Delete` | Yes (by reading) | Met |
| S6 | `Put` purges expired, `Len()` is 1 | `TestSessions_PutPurgesExpired` | Yes (mutated) | Met |
| S7 | Lookup of expired removes it, `Len()` 1 then 0 | `TestSessions_LookupRemovesExpired` | Yes (mutated) | Met |
| S8 | Concurrent use under race detector | `TestSessions_Concurrent` | Yes (mutated: lock removed gives DATA RACE) | Met |
| U1 | Correct credentials: `ExpiresAt` = now + lifetime, stored under token (FR-1, FR-5) | `TestAuthSignIn_CreatesSession` | Yes (mutated) | Met |
| U2 | Distinct tokens, 43 URL-safe chars, token differs from CSRF (NFR-8) | `TestAuthSignIn_TokensAreDistinctAndWellFormed` | Yes (mutated: CSRF = token) | Met |
| U3 | Mismatch table returns `ErrInvalidCredentials`, nothing stored (FR-1) | `TestAuthSignIn_RejectsMismatches` | Yes (mutated: password-only compare fails the wrong-username row) | Met |
| U4 | Other configured credentials: only those sign in (FR-101) | `TestAuthSignIn_UsesConfiguredCredentials` | Yes (by reading; a hardcoded pair fails both halves) | Met |
| U5 | Empty username / password / both: `ValidationError`, exact entries and order, nothing stored | `TestAuthSignIn_RequiredFields` | Yes (by reading; asserts the whole slice) | Met |
| U6 | HTTPS on + plain HTTP: `ErrHTTPSRequired` for correct, wrong, empty; on+HTTPS and off+HTTP sign in (FR-97) | `TestAuthSignIn_RequireHTTPS` | Yes (mutated: check moved after credentials) | Met |
| U7 | Sign-out removes that session, keeps another (FR-3) | `TestAuthSignOut_RemovesOnlyThatSession` | Yes (mutated: no-op) | Met |
| H1 | `signIn` 200: body, one cookie with all attributes, spy got username, password, scheme | `TestSignIn_Success` | Yes (mutated: Max-Age removed) | Met |
| H2 | Cookie `Secure` follows "require HTTPS" (FR-98) | `TestSignIn_CookieSecureFollowsSetting` | Yes (mutated) | Met |
| H3 | Scheme true only with `TRUST_PROXY` and `X-Forwarded-Proto: https` (FR-97, FR-99) | `TestSignIn_SchemePassedToUsecase` | Yes (by reading; three rows) | Met |
| H4 | `ErrInvalidCredentials` gives 401, no `detail`/`errors`, no echo of input (FR-1) | `TestSignIn_InvalidCredentials` | Yes (by reading; also asserts the log has no username or password) | Met |
| H5 | `expires_at` in UTC | `TestSignIn_ExpiresAtIsUTC` | Yes (mutated) | Met |
| H6 | `null` body and `null` field reach spy as empty | `TestSignIn_NullsReachUsecaseAsEmpty` | Yes (by reading; asserts the spy call and not-400) | Met |
| H7 | `ErrHTTPSRequired` gives 403 with exact `detail` (FR-97) | `TestSignIn_HTTPSRequired` | Yes (by reading; `JSONEq` on the full body) | Met |
| H8 | `ValidationError` gives 422 with each field | `TestSignIn_ValidationFailed` | Yes (by reading) | Met |
| H9 | Binding failures 400 x4, 415, 413; spy not called | `TestSignIn_BindingFailures` | Yes (by reading; also a body exactly at the limit is accepted) | Met |
| H10 | `signIn` needs no session or CSRF | `TestSignIn_NeedsNoSessionOrCSRF` | Yes (by reading; and the public-ops list in `router_test.go` pins it) | Met |
| H11 | `getSession` 200 returns gate's session; 401 without cookie (FR-4) | `TestGetSession` | Yes (by reading; two calls give the same body) | Met |
| H12 | `signOut` 204, empty, no `Set-Cookie`, spy got token; 403 without CSRF, spy not called; 401 without session (FR-3, NFR-8) | `TestSignOut` | Yes (mutated: no-op and wrong token) | Met |
| H13 | Unexpected spy error gives 500 `internal_error`, text hidden, on both | `TestSession_UnexpectedErrorHidesItsText` | Yes (by reading) | Met |
| H14 | Existing `router_test.go` passes unchanged | `go test ./internal/handler/...` | `router_test.go` is not in the diff; the gate tables ran green against the real operations | Met |
| R1 | `make check` passes | | | Met |
| R2 | Nothing outside allowed paths; `go.mod`/`go.sum` unchanged | | The diff touches only `backend/**` and `docs/tasks/sign-in-api.plan.md`; no migration, no `go.mod`/`go.sum`, no generated code | Met |

## Plan check

I read `docs/tasks/sign-in-api.plan.md` after the code review above.

- Every criterion in the task file is in the plan (8 store, 7 usecase, 13 handler, 2 repo-wide). None is missing.
- Every ticked item names a test that exists and checks the behaviour (confirmed above).
- The plan's judgment calls match the diff: `NewServer(settings, auth, log, secureCookie)`; the warning is logged in the handler; `routerOptions` gained `auth`, `requireHTTPS`, `logOutput`.
- The plan ticks the integration item as "not run" with a reason. That is accurate: no integration tests exist.
- The plan says no mutation checks were run by the builder, which matches the diff (nothing hints at them).
- No difference between the plan and the diff.

## Rule checks

- **Dependencies:** none added; `go.mod`, `go.sum` untouched; standard library only (`crypto/rand`, `crypto/sha256`, `crypto/subtle`, `encoding/base64`, `net/http`).
- **Constant-time comparison (`usecase/auth.go`):** both `equalDigest` calls always run before the branch; the results are combined with `userOK&passOK != 1`; comparison is `subtle.ConstantTimeCompare` on SHA-256 digests; no `==` or `bytes.Equal` on a credential. The empty-field check returns before comparing, as the task says.
- **Wiring (`cmd/server/main.go`):** `noSessions` is gone; one `memstore.NewSessions` instance goes to both `NewAuthService` and `Deps.Sessions`; credentials and require-HTTPS come from `cfg`.
- **Nothing stored (FR-114, CONVENTIONS rule 12):** no change under `backend/migration/` or `backend/internal/repository/`; `memstore` imports only `domain` and `pkg/clock`.
- **Time:** no `time.Now`, `Sleep`, `After` or `NewTimer` in the diff outside `cmd/`.
- **Logging:** the only new log call is `s.log.Warn("sign-in failed")` with no attributes. Only `handler/` logs; the usecase and store do not.
- **Layering:** `usecase/` imports only `domain`; `memstore/` imports neither `usecase` nor `handler`; `handler/session.go` uses `api` types and calls the usecase through its own `AuthService` interface.
- **No 429, no counter:** nothing counts failed sign-ins.
- **Contract (CONVENTIONS rules 2, 3, 4):** errors use codes from `docs/openapi.yaml`; the field errors carry field paths and messages; timestamps are UTC. All responses pass `AssertConforms`.
- **Test rules (TESTING.md):** tests live in the existing file for each source file; the usecase test uses a fake with `clock.Fake`; no `_edge` or `_regress` files; no real-time waits.
- **Sign-out end to end, by reading and by a live run:** the handler passes `session.Token` from the gate to the usecase, the usecase deletes it from the store, the gate reads the same store.

## Mutation checks run

Each was applied to the source, the named test run, then reverted with `git checkout`. All 12 failed as expected; the worktree is clean.

| Mutation | Failing test |
|---|---|
| Store ignores `ExpiresAt` | `TestSessions_ExpiresAtBoundary`, `TestSessions_LookupRemovesExpired` |
| `Put` stops purging expired | `TestSessions_PutPurgesExpired` |
| Mutex removed from the store | `TestSessions_Concurrent` (DATA RACE) |
| Drop `Secure` from the cookie | `TestSignIn_CookieSecureFollowsSetting` |
| Drop `Max-Age` | `TestSignIn_Success` |
| HTTPS check moved after the credentials | `TestAuthSignIn_RequireHTTPS` |
| Compare only the password | `TestAuthSignIn_RejectsMismatches` |
| `SignOut` in the usecase is a no-op | `TestAuthSignOut_RemovesOnlyThatSession` |
| Handler passes the wrong token to `SignOut` | `TestSignOut` |
| `ExpiresAt` = now | `TestAuthSignIn_CreatesSession` |
| CSRF token equals session token | `TestAuthSignIn_TokensAreDistinctAndWellFormed` |
| `expires_at` not converted to UTC | `TestSignIn_ExpiresAtIsUTC` |
| (first attempt at "password only" and "signOut no-op in handler" did not compile; redone in a compiling form, listed above) | |

## Cases tried beyond the task file

I built the binary and ran it against `127.0.0.1` with `REQUIRE_HTTPS=false`, then with `true`. All matched the contract.

- `{}` and `{"username":"","password":""}`: 422, both fields in order.
- Username of 10,000 characters: 401. Username and password of one space: 401.
- Wrong username and wrong password: identical 401 bodies; one `sign-in failed` warning line each, no attributes.
- Extra properties, duplicate keys and trailing text after the JSON object: accepted (200). See Non-blocking 2.
- Two `session` cookies: the first one counts (valid first gives 200; bogus first gives 401).
- `DELETE /api/session` with another session's CSRF token: 403. Without the token: 403. With the right one: 204, no `Set-Cookie`.
- Cookie of a signed-out session: 401. A second session stays valid after the first signs out. Cookie name `Session` (other case), empty cookie, and the CSRF token used as a cookie: all 401.
- `GET /api/session` twice: byte-identical body, `expires_at` unchanged (FR-5).
- 100 concurrent sign-ins (20 in parallel): all 200, no error.
- `REQUIRE_HTTPS=true` over plain HTTP: 403 `https_required` with the exact `detail`, for good credentials, for an empty body, and with `X-Forwarded-Proto: https` while trust is off. The cookie has no `Secure` attribute when `REQUIRE_HTTPS=false`.
- The 30-day expiry itself cannot be waited out on the real clock; it is covered by the fake-clock boundary test (S3).

## Findings

### Blocking

None.

### Non-blocking

1. **`memstore.Put` accepts a session with an empty token.** *Category:* latent bug. It stores it under `""`, and `Session("")` then finds it. `AuthService` always sets a token, so nothing can do this today. *Matters when:* report only (no caller can store a token-less session today).
2. **The generated binder accepts duplicate keys (last wins) and trailing text after the JSON object.** *Category:* cosmetic. It is the generator's decoding, outside this task's files, and the router still rejects a non-object or a wrong-typed field. *Matters when:* report only.
3. **The defensive `Body == nil` branch in `SignIn` has no test.** *Category:* test quality. The router rejects a missing body before the handler runs, so the branch is unreachable from HTTP. *Matters when:* the router's required-body check changes or is bypassed for this route.

## Docs or specs that no longer match

- **`docs/openapi.yaml`:** nothing out of date. The three operations behave as written; `429 sign_in_locked` is still not produced (FR-2, in the backlog).
- **`docs/requirements.md`:** nothing out of date.
- **`STACK.md`:** no dependency was added and no version adopted, so there is nothing to record. The "Sign-in lockout: none, hand-rolled" row still describes FR-2, which is still to do.
- **`docs/tasks/backlog.md`:** the FR-2 row ("Left out of `sign-in-api`") is still accurate. The "Browser checkpoint" line becomes actionable once `sign-in-screen` also merges.
- **`ARCHITECTURE.md`:** consistent with the new files (`memstore/sessions.go`, `usecase/auth.go`, `handler/session.go`, `domain/validation.go`). `domain.ValidationError` is the shared type later tasks reuse for 422.
