# Task: sign-in API

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The admin can sign in, read the current session and sign out through the API: `signIn`, `getSession` and `signOut` become real, backed by a session store in memory. After this task a signed-in request passes the gate that today refuses everything, so every later gated operation can be reached.

Requirements covered: FR-1, FR-3, FR-4, FR-5, FR-97, FR-98, FR-101, FR-114, NFR-8.

Out of scope:

- The sign-in lockout (FR-2) and `429 sign_in_locked`. It stays in the backlog for milestone 5. `signIn` never answers 429 after this task.
- The sign-in screen and everything under `frontend/`. A separate task, `sign-in-screen`, builds it against a mock of these operations.
- Resolving the scheme and the client address (FR-99). `middleware.ResolveRequestInfo` already does it and is tested; this task only reads its result.
- The gate and the CSRF check themselves. `middleware.RequireSession` and `middleware.RequireCSRF` exist and are tested; this task gives them real sessions.
- FR-102 and FR-103. The configuration loader already refuses to start without the credentials, with tests.
- Telling the browser to drop the cookie at sign-out. The contract's `signOut` 204 lists no `Set-Cookie` header (see "Known gaps").
- End-to-end tests. The milestone's last task writes them.

## Role and ownership

Role: Backend.

You may change `backend/**`. You may not change `backend/migration/**`, `backend/internal/api/**` (generated), `backend/go.mod`, `backend/go.sum`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/sign-in-api.plan.md`), `.env.example`, the `Makefile` or anything else outside `backend/`.

Shared files this task touches, all owned by this task while it runs:

- `backend/cmd/server/main.go` (wiring)
- `backend/internal/handler/server.go` (the `Server` fields and `NewServer`)
- `backend/internal/handler/problem.go` (the error mapping)
- `backend/internal/handler/helpers_test.go` (the shared test router)
- `backend/internal/domain/errors.go`, `backend/internal/domain/session.go`
- `backend/internal/usecase/fakes_test.go`

Tasks that may run at the same time: `sign-in-screen` (frontend only, no shared file) and `http-probe` (backend; it changes only `backend/internal/adaptor/probe/`, a new file in `backend/internal/testutil/` and a new file in `backend/internal/domain/`). Neither touches the files above. No other backend task runs beside this one.

## Operations used

From `docs/openapi.yaml`. All three are 501 stubs in `backend/internal/handler/stubs.go` today. Types come from the generated package `backend/internal/api`, never hand-written.

| Operation | Method and path | Access | Responses this task produces |
|---|---|---|---|
| `signIn` | `POST /api/session` | public | 200 with `Set-Cookie` and `SessionInfo`; 400 `malformed_request`; 401 `invalid_credentials`; 403 `https_required` with `detail`; 413 `payload_too_large`; 415 `unsupported_media_type`; 422 `validation_failed`; 500 `internal_error` |
| `getSession` | `GET /api/session` | gated | 200 `SessionInfo`; 401 `unauthenticated` |
| `signOut` | `DELETE /api/session` | gated, needs `X-CSRF-Token` | 204; 401 `unauthenticated`; 403 `csrf_failed`; 500 `internal_error` |

The contract also lists `429 sign_in_locked` for `signIn`. This task does not produce it.

## Behavior

### What exists and what this task replaces

- `handler.NewRouter` already applies, for every operation: the request size limit (413), the JSON content type (415), a required body (400), the gate (401) and the CSRF check (403). Handlers never repeat these checks.
- `cmd/server/main.go` passes `noSessions{}` as `Deps.Sessions`, so every gated operation answers 401. This task removes `noSessions` and passes the session store.
- `domain.Session` has `CSRFToken` and `ExpiresAt`. `domain.SessionLifetime` is 30 days.
- `config.Config` has `AdminUsername`, `AdminPassword` and `RequireHTTPS`.
- The strict handlers receive the request's context, so `middleware.RequestInfoFrom(ctx)` and `middleware.SessionFrom(ctx)` work inside a handler.

### signIn

The router's checks run first, in this order: request size (413), content type (415), a missing body (400). A body that is not valid JSON, that is valid JSON but not an object (`[]`, `"x"`, `5`), or whose `username` or `password` is a number, a boolean, a list or an object, is `400 malformed_request` from the generated binder. A JSON `null`, for a field or for the whole body, decodes as absent and reaches step 2. Unknown properties are ignored. If the handler is ever handed a nil body, it returns `errMalformedRequest`, as `handler/settings.go` does. Then the operation checks, in this order, and stops at the first that fails:

1. **HTTPS.** When "require HTTPS" is on (`config.Config.RequireHTTPS`) and `middleware.RequestInfoFrom(ctx).HTTPS` is false, answer `403 https_required` with title `HTTPS required` and this `detail`, exactly:

   `Sign-in is only allowed over HTTPS. If the app is behind an HTTPS proxy, set TRUST_PROXY=true. To allow sign-in over plain HTTP, set REQUIRE_HTTPS=false. Restart the app after changing either setting.`

   The credentials are not looked at. When "require HTTPS" is off, the scheme is not checked.
2. **Required fields.** A `username` or `password` that is absent or the empty string is `422 validation_failed` with title `Validation failed`. Each empty field gets one entry in `errors`, `username` before `password`:

   | `field` | `code` | `message` |
   |---|---|---|
   | `username` | `required` | `Enter the username.` |
   | `password` | `required` | `Enter the password.` |

   Only the empty string counts as empty. A value of spaces is a value and goes to step 3. The credentials are not compared when this step fails.
3. **Credentials.** The username and the password are compared with the configured ones, exactly: case-sensitive, nothing trimmed. Both are always compared, in constant time, and the comparison must not reveal the length of either configured value (compare fixed-length digests, for example SHA-256, with `crypto/subtle`, and combine the two results without a branch between them). Any mismatch is `401 invalid_credentials` with title `Invalid credentials` and no `detail`. The response is byte-for-byte the same whichever part was wrong.
4. **Session.** Create a session and answer 200.

A new session has:

- a session token and a CSRF token: two separate values, each 32 bytes from `crypto/rand`, encoded as unpadded URL-safe base64 (43 characters);
- `ExpiresAt` = the clock's current time plus `domain.SessionLifetime`.

The 200 response:

- body `SessionInfo`: `csrf_token` is the session's CSRF token, `expires_at` is `ExpiresAt` in UTC;
- header `Set-Cookie`, one cookie: name `session` (`middleware.SessionCookie`), value the session token, `Path=/`, `HttpOnly`, `SameSite=Strict`, `Max-Age` equal to `domain.SessionLifetime` in whole seconds (2592000), and `Secure` exactly when "require HTTPS" is on. No `Domain` and no `Expires` attribute. `Secure` follows the setting, not the scheme of the request.

Signing in while a session already exists creates another session. The earlier one stays valid until it expires or is signed out.

Logging: the handler logs one warning line for each `invalid_credentials`, with the message `sign-in failed` and no attributes at all. Nothing else in this task logs, apart from the existing unexpected-error line.

### getSession

Behind the gate. Answers 200 with `SessionInfo` for the session the gate found (`middleware.SessionFrom(ctx)`): its CSRF token and its `ExpiresAt`. It creates nothing and extends nothing: `expires_at` is the same value on every call (FR-5), rendered in UTC. It calls no usecase.

In `getSession` and `signOut`, if `middleware.SessionFrom(ctx)` reports no session (not reachable behind the gate), return `domain.ErrUnauthenticated`.

### signOut

Behind the gate and the CSRF check. Removes the session of this request from the store and answers 204 with no body and no `Set-Cookie` header. Other sessions are untouched. After it, the same cookie is an unknown session: every gated operation answers `401 unauthenticated`.

### The session store

In `memstore/`, in memory only, empty at every start (FR-114). It takes the clock as `clock.Clock` from `backend/pkg/clock`.

- A session is valid while the clock's time is before `ExpiresAt`. At exactly `ExpiresAt` and after, it is not found (FR-5).
- Looking a session up never changes `ExpiresAt`.
- An expired session is removed when it is looked up, and every expired session is removed whenever a new one is stored, so the store does not grow without bound. The store has a method `Len() int` (new) that returns how many sessions it holds, expired ones included, so tests can see the removal.
- It is safe for concurrent use.
- It satisfies `middleware.SessionReader` (`Session(token string) (domain.Session, bool)`), and the session it returns carries its own token (see "Structure").

### Known gaps

- **No lockout (FR-2).** Wrong passwords can be tried without limit until the milestone 5 task. Tracked in the backlog. Do not build a counter.
- **The cookie stays in the browser after sign-out.** The contract's 204 has no `Set-Cookie`, so the server cannot clear it. The cookie is dead on the server; the next sign-in overwrites it. Decided by the user. Do not add the header.
- **Sessions are not limited in number.** Each needs the correct password, and expired ones are purged.
- **`https_required` behind a proxy with `TRUST_PROXY` off.** Every request then counts as plain HTTP (FR-99), so sign-in is refused even though the browser used HTTPS. That is the intended behavior; the `detail` text tells the installer what to set.

## Structure

By `ARCHITECTURE.md`. Every name marked "new" does not exist yet and is fixed by this file. Names this file does not give (constructors, unexported helpers, test doubles) are the builder's choice, following the settings code as the example.

- `domain/session.go`: `domain.Session` gains a field `Token string` (new), the session token. The store fills it; `signOut` reads it from `middleware.SessionFrom(ctx)`. It is never logged and never put in a response body. `Session` is not a table (`docs/data-model.md`), so the rule in `ARCHITECTURE.md` that a new domain field needs a migration does not apply: no migration.
- `domain/errors.go`: new sentinels `ErrInvalidCredentials` and `ErrHTTPSRequired`.
- `domain/validation.go` (new file):
  - `domain.FieldError` (new): a struct with `Field string` (the path in the contract's syntax), `Code FieldErrorCode` and `Message string`.
  - `domain.FieldErrorCode` (new): a string type, with the constant `FieldErrorRequired` = `required`. Later tasks add the other codes.
  - `domain.ValidationError` (new): a struct with `Fields []FieldError` that implements `error`. Usecases return it as a value; handlers find it with `errors.As`.
  - It is the one type every later task uses for `422 validation_failed`. Nothing in the file knows about sign-in.
- `usecase/auth.go` (new file): `usecase.AuthService` (new) with a constructor that takes the configured username, the configured password, the "require HTTPS" setting, the session store and the clock (`usecase.Clock`). Two methods:
  - `SignIn(ctx, username, password string, https bool) (domain.Session, error)`: steps 1 to 4 of `signIn`. The error is `domain.ErrHTTPSRequired`, a `domain.ValidationError` or `domain.ErrInvalidCredentials`.
  - `SignOut(ctx, token string) error`.
  - It defines `usecase.SessionStore` (new), in the same file: `Put(session domain.Session)` and `Delete(token string)`, with no context and no error, because the store is in memory. Token generation lives in this file too.
- `memstore/sessions.go` (new file): the session store, `memstore.Sessions` (new), with `Put`, `Delete`, `Session` and `Len`. It satisfies `usecase.SessionStore` and `middleware.SessionReader` without importing `usecase/` or `handler/`.
- `handler/session.go` (new file): the three operations as methods on `*Server`. They map between `api` types and domain types, build the cookie (the generated `SignIn200ResponseHeaders.SetCookie` is a pointer to the serialized cookie string), and log the failed sign-in. `stubs.go` is not edited.
- `handler/server.go`: `handler.AuthService` (new), an interface with the two methods above, beside `SettingsService`. `Server` gains, each as its own field line and its own `NewServer` argument: the auth service, the logger, and whether the cookie is `Secure`.
- `handler/problem.go`: the mapping gains `ErrInvalidCredentials` (401, `invalid_credentials`, `Invalid credentials`, no `detail`), `ErrHTTPSRequired` (403, `https_required`, `HTTPS required`, with the `detail` above) and `domain.ValidationError` (422, `validation_failed`, `Validation failed`, with `errors`). The mapping table has no `detail` today; extend it.
- `cmd/server/main.go`: build one session store with `clock.Real{}` and pass the same instance to the auth service and to `Deps.Sessions`. The auth service gets `cfg.AdminUsername`, `cfg.AdminPassword` and `cfg.RequireHTTPS`; `NewServer` gets the auth service, `log` and `cfg.RequireHTTPS`. Delete `noSessions`.

Only `platform/config` reads the environment; the usecase receives the values.

## Dependencies

None. Everything needed is in the Go standard library (`crypto/rand`, `crypto/subtle`, `crypto/sha256`, `encoding/base64`, `net/http`). `go.mod` and `go.sum` do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Usecase and memstore tests use `clock.Fake`. No integration test (build tag `integration`) is needed.

**Session store (`memstore/sessions_test.go`)**

- A new store knows no session (FR-114).
- A stored session is found by its token, with its token, CSRF token and `ExpiresAt`; an unknown token and the empty token are not found.
- With the clock advanced to one second before `ExpiresAt` the session is found; advanced to exactly `ExpiresAt` it is not (FR-5).
- Looking a session up, any number of times, leaves `ExpiresAt` unchanged (FR-5).
- A deleted session is not found; another session stored beside it still is (FR-3).
- Storing a session removes the expired ones: after the clock passes a first session's `ExpiresAt` and a second is stored, `Len()` is 1.
- Looking up an expired session removes it: with one session stored and the clock past its `ExpiresAt`, `Len()` is 1 before the lookup and 0 after.
- Concurrent stores, lookups and deletes from many goroutines pass under the race detector.

**Auth usecase (`usecase/auth_test.go`, the fake store in `usecase/fakes_test.go`)**

- Correct credentials return a session whose `ExpiresAt` is the fake clock's time plus `domain.SessionLifetime`, and the session is in the store under its token (FR-1, FR-5).
- Two sign-ins return different session tokens and different CSRF tokens; within one session the two tokens differ; each is 43 characters of the URL-safe base64 alphabet (NFR-8).
- A table of mismatches each returns `ErrInvalidCredentials` and stores nothing: wrong username, wrong password, both wrong, the username in another letter case, the password with a trailing space, the right password with the username of spaces (FR-1).
- The service is built with other credentials than the other tests use, and only those sign in (FR-101).
- An empty username, an empty password, and both: a `ValidationError` with exactly the entries of the table above, in that order, and nothing stored.
- "Require HTTPS" on and a plain-HTTP request: `ErrHTTPSRequired` with correct credentials, with wrong credentials and with empty fields, and nothing stored (FR-97). On and HTTPS: signs in. Off and plain HTTP: signs in.
- Sign out removes that session from the store and leaves another one in place (FR-3).

**Handlers (`handler/session_test.go`, with a spy of the auth interface; every response passes `testutil.AssertConforms`)**

- `signIn` 200: the body has the spy's CSRF token and `expires_at`; `Set-Cookie` has one cookie named `session` with the spy's token, `Path=/`, `HttpOnly`, `SameSite=Strict` and `Max-Age=2592000`; the spy received the username, the password and the scheme the router resolved.
- The cookie has `Secure` when the server is built with "require HTTPS" on and lacks it when off (FR-98).
- The scheme passed to the spy is true only with `TRUST_PROXY` on and `X-Forwarded-Proto: https`; with trust off the same header gives false (FR-97, FR-99 as already built).
- `signIn` maps `ErrInvalidCredentials` to 401 `invalid_credentials`; the body has no `detail` and no `errors`, and contains neither the username nor the password that was sent (FR-1). That the answer is the same whichever part was wrong is proven by the usecase table.
- `signIn` renders `expires_at` in UTC when the spy returns a time in another zone.
- A body of `null` and `{"username":null,"password":"x"}` reach the spy with empty strings (they are not 400).
- `signIn` maps `ErrHTTPSRequired` to 403 `https_required` with the exact `detail` text above (FR-97).
- `signIn` maps a `ValidationError` to 422 `validation_failed` with `errors` carrying each field, code and message.
- `signIn` binding failures, none of which reaches the spy: no body is 400; `{"username":` is 400; `{"username":5,"password":"x"}` is 400; `[]` is 400; `text/plain` is 415; a body one byte over a small configured limit is 413.
- `signIn` needs no session and no CSRF token.
- `getSession` 200 returns the CSRF token and `ExpiresAt` of the session the gate found; without a cookie it is 401 `unauthenticated` (FR-4).
- `signOut` 204 with an empty body and no `Set-Cookie`; the spy received the token of the request's session; without the CSRF token it is 403 `csrf_failed` and the spy is not called; without a session it is 401 (FR-3, NFR-8).
- An unexpected error from the spy, on `signIn` and on `signOut`, is 500 `internal_error` and its text is not in the body.
- The existing tests in `handler/router_test.go` still pass unchanged in what they assert: the gate and CSRF tables now run against the real `signIn`, `getSession` and `signOut`.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `go.mod` and `go.sum` are unchanged.

Tests this task changes on purpose: `handler/helpers_test.go` is extended for the new `NewServer` arguments, and its `oneSession` returns the session with its token. `newRouter` installs a default auth spy when a test gives none, as it does for settings, so the gate and CSRF tables keep running against all three operations. No existing assertion is removed or loosened.

## Verifier checks

- **Constant-time comparison, by reading `usecase/auth.go`:** both the username and the password are compared on every call that reaches step 3; there is no early return between the two comparisons; the comparison uses `crypto/subtle` on fixed-length digests; no `==` or `bytes.Equal` on a credential.
- **Wiring, by reading `cmd/server/main.go`:** `noSessions` is gone; one store instance is passed both to the auth service and to `Deps.Sessions`; the credentials and "require HTTPS" come from `cfg`.
- **Nothing stored:** no file under `backend/migration/` or `backend/internal/repository/` changed, and `memstore/` imports neither `repository` nor `gorm` (FR-114).
- **Time:** no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` in the diff outside `cmd/`.
- **Logging:** the only new log call is the `sign-in failed` warning; no username, password, token or address appears in any log attribute or error text.
- **Layering:** `usecase/` does not import `memstore`, `handler` or `internal/api`; `memstore/` does not import `usecase` or `handler`.
- **No 429 and no counter:** nothing counts failed sign-ins.
- **Mutation checks to run:** make the store ignore `ExpiresAt` (the boundary test must fail); drop `Secure` (the cookie test must fail); swap the order of steps 1 and 3 (the "HTTPS required with wrong credentials" test must fail); compare only the password (the wrong-username row must fail); make `signOut` a no-op (the store and spy tests must fail).
- **Sign-out end to end, by reading:** the handler passes the request's own session token to the usecase, the usecase deletes it from the store, and the gate reads the same store, so the cookie is refused afterwards (FR-3). The tests prove each seam; no test wires the layers together (`TESTING.md`).
- **Inputs to try:** `{}` (422, both fields); `{"username":"","password":""}` (422, both fields); a username of 10,000 characters (401); two `session` cookies in one request (the first one counts); `DELETE /api/session` with another session's CSRF token (403); `GET /api/session` with the cookie of a signed-out session (401).

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, a config key, or an edit to a spec file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.
- The generated `SignIn200JSONResponse` cannot carry the cookie as described, or a strict handler cannot read `middleware.SessionFrom` or `middleware.RequestInfoFrom` from its context.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), that no integration tests apply, that no dependency changed, and anything you were unsure about. Also list every judgment call this file did not settle.
