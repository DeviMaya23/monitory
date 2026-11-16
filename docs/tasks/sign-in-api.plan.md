# Plan: sign-in API

Branch: `feat/sign-in-api`. Integration tests: none apply (task file); `make test-integration` outcome is recorded at the end.

## Acceptance criteria

### Session store (`backend/internal/memstore/sessions.go`, tests in `sessions_test.go`)

- [ ] New store knows no session (FR-114): `TestSessions_NewStoreIsEmpty`
- [ ] Stored session found by token with token, CSRF token, `ExpiresAt`; unknown and empty token not found: `TestSessions_FindByToken`
- [ ] Found one second before `ExpiresAt`, not found at exactly `ExpiresAt` (FR-5): `TestSessions_ExpiresAtBoundary`
- [ ] Lookups leave `ExpiresAt` unchanged (FR-5): `TestSessions_LookupDoesNotExtend`
- [ ] Deleted session gone, neighbour stays (FR-3): `TestSessions_Delete`
- [ ] Put removes expired sessions, `Len()` is 1: `TestSessions_PutPurgesExpired`
- [ ] Lookup of an expired session removes it, `Len()` 1 then 0: `TestSessions_LookupRemovesExpired`
- [ ] Concurrent use under the race detector: `TestSessions_Concurrent`

### Auth usecase (`backend/internal/usecase/auth.go`, tests in `auth_test.go`, fake store in `fakes_test.go`)

- [ ] Correct credentials: `ExpiresAt` = now + `SessionLifetime`, stored under token (FR-1, FR-5): `TestAuthSignIn_CreatesSession`
- [ ] Distinct tokens across and within sessions, 43 URL-safe base64 chars (NFR-8): `TestAuthSignIn_TokensAreDistinctAndWellFormed`
- [ ] Mismatch table returns `ErrInvalidCredentials`, nothing stored (FR-1): `TestAuthSignIn_RejectsMismatches`
- [ ] Other configured credentials: only those sign in (FR-101): `TestAuthSignIn_UsesConfiguredCredentials`
- [ ] Empty username/password/both: `ValidationError` with the table's entries in order, nothing stored: `TestAuthSignIn_RequiredFields`
- [ ] Require HTTPS on + plain HTTP: `ErrHTTPSRequired` for correct, wrong and empty credentials; on+HTTPS and off+HTTP sign in (FR-97): `TestAuthSignIn_RequireHTTPS`
- [ ] Sign-out removes that session, leaves another (FR-3): `TestAuthSignOut_RemovesOnlyThatSession`

### Handlers (`backend/internal/handler/session.go`, tests in `session_test.go`)

- [ ] signIn 200: body, one cookie with attributes, spy received username/password/scheme: `TestSignIn_Success`
- [ ] Cookie `Secure` follows require-HTTPS (FR-98): `TestSignIn_CookieSecureFollowsSetting`
- [ ] Scheme true only with TRUST_PROXY and `X-Forwarded-Proto: https` (FR-97, FR-99): `TestSignIn_SchemePassedToUsecase`
- [ ] `ErrInvalidCredentials` -> 401, no detail/errors, no echo of input (FR-1): `TestSignIn_InvalidCredentials`
- [ ] `expires_at` rendered in UTC: `TestSignIn_ExpiresAtIsUTC`
- [ ] `null` body and `null` field reach spy as empty strings: `TestSignIn_NullsReachUsecaseAsEmpty`
- [ ] `ErrHTTPSRequired` -> 403 with exact detail (FR-97): `TestSignIn_HTTPSRequired`
- [ ] `ValidationError` -> 422 with errors: `TestSignIn_ValidationFailed`
- [ ] Binding failures (400 x4, 415, 413), spy not called: `TestSignIn_BindingFailures`
- [ ] signIn needs no session or CSRF: `TestSignIn_NeedsNoSessionOrCSRF`
- [ ] getSession 200 and 401 (FR-4): `TestGetSession`
- [ ] signOut 204 empty, no Set-Cookie, spy got token; 403 without CSRF; 401 without session (FR-3, NFR-8): `TestSignOut`
- [ ] Unexpected spy error -> 500 `internal_error`, text hidden, on both: `TestSession_UnexpectedErrorHidesItsText`
- [ ] Existing `router_test.go` passes unchanged: `go test ./internal/handler/...`

### Repo-wide

- [ ] `make check` passes
- [ ] Nothing outside allowed paths changed; `go.mod`/`go.sum` unchanged

## Integration tests

- [ ] `make test-integration`: pending

## Judgment calls

(filled in at the end)
