# Plan: sign-in API

Branch: `feat/sign-in-api`. Integration tests: none apply (task file); `make test-integration` outcome is recorded at the end.

## Acceptance criteria

### Session store (`backend/internal/memstore/sessions.go`, tests in `sessions_test.go`)

- [x] New store knows no session (FR-114): `TestSessions_NewStoreIsEmpty`
- [x] Stored session found by token with token, CSRF token, `ExpiresAt`; unknown and empty token not found: `TestSessions_FindByToken`
- [x] Found one second before `ExpiresAt`, not found at exactly `ExpiresAt` (FR-5): `TestSessions_ExpiresAtBoundary`
- [x] Lookups leave `ExpiresAt` unchanged (FR-5): `TestSessions_LookupDoesNotExtend`
- [x] Deleted session gone, neighbour stays (FR-3): `TestSessions_Delete`
- [x] Put removes expired sessions, `Len()` is 1: `TestSessions_PutPurgesExpired`
- [x] Lookup of an expired session removes it, `Len()` 1 then 0: `TestSessions_LookupRemovesExpired`
- [x] Concurrent use under the race detector: `TestSessions_Concurrent`

### Auth usecase (`backend/internal/usecase/auth.go`, tests in `auth_test.go`, fake store in `fakes_test.go`)

- [x] Correct credentials: `ExpiresAt` = now + `SessionLifetime`, stored under token (FR-1, FR-5): `TestAuthSignIn_CreatesSession`
- [x] Distinct tokens across and within sessions, 43 URL-safe base64 chars (NFR-8): `TestAuthSignIn_TokensAreDistinctAndWellFormed`
- [x] Mismatch table returns `ErrInvalidCredentials`, nothing stored (FR-1): `TestAuthSignIn_RejectsMismatches`
- [x] Other configured credentials: only those sign in (FR-101): `TestAuthSignIn_UsesConfiguredCredentials`
- [x] Empty username/password/both: `ValidationError` with the table's entries in order, nothing stored: `TestAuthSignIn_RequiredFields`
- [x] Require HTTPS on + plain HTTP: `ErrHTTPSRequired` for correct, wrong and empty credentials; on+HTTPS and off+HTTP sign in (FR-97): `TestAuthSignIn_RequireHTTPS`
- [x] Sign-out removes that session, leaves another (FR-3): `TestAuthSignOut_RemovesOnlyThatSession`

### Handlers (`backend/internal/handler/session.go`, tests in `session_test.go`)

- [x] signIn 200: body, one cookie with attributes, spy received username/password/scheme: `TestSignIn_Success`
- [x] Cookie `Secure` follows require-HTTPS (FR-98): `TestSignIn_CookieSecureFollowsSetting`
- [x] Scheme true only with TRUST_PROXY and `X-Forwarded-Proto: https` (FR-97, FR-99): `TestSignIn_SchemePassedToUsecase`
- [x] `ErrInvalidCredentials` -> 401, no detail/errors, no echo of input (FR-1): `TestSignIn_InvalidCredentials`
- [x] `expires_at` rendered in UTC: `TestSignIn_ExpiresAtIsUTC`
- [x] `null` body and `null` field reach spy as empty strings: `TestSignIn_NullsReachUsecaseAsEmpty`
- [x] `ErrHTTPSRequired` -> 403 with exact detail (FR-97): `TestSignIn_HTTPSRequired`
- [x] `ValidationError` -> 422 with errors: `TestSignIn_ValidationFailed`
- [x] Binding failures (400 x4, 415, 413), spy not called: `TestSignIn_BindingFailures`
- [x] signIn needs no session or CSRF: `TestSignIn_NeedsNoSessionOrCSRF`
- [x] getSession 200 and 401 (FR-4): `TestGetSession`
- [x] signOut 204 empty, no Set-Cookie, spy got token; 403 without CSRF; 401 without session (FR-3, NFR-8): `TestSignOut`
- [x] Unexpected spy error -> 500 `internal_error`, text hidden, on both: `TestSession_UnexpectedErrorHidesItsText`
- [x] Existing `router_test.go` passes unchanged: `go test ./internal/handler/...`

### Repo-wide

- [x] `make check` passes: run, passed (exit 0; frontend deps installed with `npm ci` first)
- [x] Nothing outside allowed paths changed; `go.mod`/`go.sum` unchanged

## Integration tests

- [x] `make test-integration`: not run: the task touches no code that has integration tests (memstore, usecase, handler have none) and the task file says none is needed

## Judgment calls

- `domain.ValidationError` is returned and matched as a value (`errors.As` into a value), as the task says. Its `Error()` text is the fixed string `validation failed`.
- `memstore.NewSessions` takes `clock.Clock` as specified; the fake clock satisfies it.
- `AuthService.SignIn` ignores the context (the store is in memory); the parameter stays for the fixed signature.
- The empty-fields check (step 2) does not hash anything; only step 3 compares, as specified.
- `NewServer` argument order: settings, auth, log, secureCookie.
- The `sign-in failed` warning is logged in the handler when the error `Is` `ErrInvalidCredentials`, before the error is returned for mapping.
- Test helper: `routerOptions` gained `auth`, `requireHTTPS` and `logOutput` (for the log assertion). `newRouter` builds one logger and passes it to both `NewServer` and `Deps`.
- No mutation checks were run by me; the verifier runs them.
