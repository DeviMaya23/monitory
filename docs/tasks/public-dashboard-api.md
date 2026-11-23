# Task: public dashboard API

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

An anonymous visitor can read the public status view: `getPublicDashboard` becomes real. While the public view is on it returns the services the admin chose that are healthy or unhealthy, with name, status and time of the last check and nothing else, ordered by name ignoring case. While the view is off it answers `404 public_view_unavailable`. One client address may make at most the configured number of requests in a fixed one-minute window (60 by default); the next ones are `429 rate_limited` with `Retry-After`. It is the last operation that answered 501, so the 501 scaffolding is removed with it. After this task the public page (`/status`) and the admin dashboard's `Open` link work against the real server.

Requirements covered:

- FR-28: while the view is on, the chosen services are returned.
- FR-29: while the view is off, `404 public_view_unavailable`.
- FR-32: at most `PUBLIC_RATE_LIMIT_PER_MINUTE` requests per client address per fixed window; over that, `429 rate_limited` with `Retry-After` set to the seconds left in the window. The value comes from configuration, not a literal.
- FR-40, FR-63: the response carries `name`, `status` and `last_checked_at` of each service and nothing else; the types that carry it have no other field.
- FR-77, in part (the public half), and FR-113: a paused service and a service that is not yet checked are not returned, whatever its public toggle says.
- FR-99, in part: the address that is counted is the one the policy router resolved (`RequestInfo.ClientAddr`). The journey with proxy trust on is milestone 5.
- FR-4, FR-96 (reachability): the operation answers without a session, whether or not one is sent.

Out of scope:

- The public page and the admin switches (`public-dashboard-screen`, `dashboard-public-switch`, `service-public-toggle`: merged).
- The end-to-end journeys of milestone 4, including the rate limit as a visitor sees it and `getHealth` (`m4-e2e-journeys`, drafted after this task).
- The sign-in lockout (`429 sign_in_locked`) and the journey with `TRUST_PROXY` on (milestone 5, `backlog.md`).
- `getHealth`: built in the foundation, unchanged.
- A new configuration key: `PUBLIC_RATE_LIMIT_PER_MINUTE` exists (`.env.example`, `platform/config`, `Limits.PublicRateLimitPerMinute`, default 60, minimum 1). The window length is fixed at one minute by the requirement.
- Editing `ARCHITECTURE.md` and `CONVENTIONS.md`: both mention the stubs (see "Removing the 501 scaffolding"); the verifier lists them for the user.
- Any change to the contract, a migration or the frontend.

## Prerequisite

All merged on the default branch (they are today); the builder checks the names and stops to ask if one is missing:

- `memstore/sessions.go` (`Sessions`, `Len`, built on `pkg/clock.Clock`) and `pkg/clock.Fake`.
- `usecase.SettingsRepository` (`PublicViewEnabled(ctx) (bool, error)`) and `repository.SettingsRepository`.
- `repository.ServiceRepository` and the `services` and `service_states` tables (`shown_on_public_view`, `paused`, `name_key`, `status`, `last_checked_at`).
- `handler/middleware.RequestInfoFrom(ctx).ClientAddr`, resolved by the policy router from `TRUST_PROXY` and `CLIENT_IP_HEADER`.
- `Limits.PublicRateLimitPerMinute` in `platform/config`.
- The generated `api.GetPublicDashboard200JSONResponse`, `...404ApplicationProblemPlusJSONResponse`, `...429ApplicationProblemPlusJSONResponse` and `api.ProblemCodePublicViewUnavailable`, `api.ProblemCodeRateLimited`.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/domain/public_service.go` (new), `domain/errors.go`;
- `backend/internal/memstore/ratelimit.go` and `ratelimit_test.go` (new);
- `backend/internal/usecase/public_view.go` and `public_view_test.go` (new), `usecase/fakes_test.go`;
- `backend/internal/repository/service_public.go` and `service_public_test.go` (new);
- `backend/internal/handler/public_view.go` and `public_view_test.go` (new), `handler/server.go`, `handler/problem.go`, `handler/router_test.go`, `handler/helpers_test.go`, and `handler/stubs.go` (deleted);
- `backend/cmd/server/main.go`.

You may not change `backend/internal/api/**` (generated), `backend/migration/**`, `backend/internal/platform/**`, the rest of `domain/`, `backend/go.mod`, `backend/go.sum`, `frontend/**`, `e2e/**`, `docs/**` (except your own plan file, `docs/tasks/public-dashboard-api.plan.md`), `.env.example`, `ARCHITECTURE.md`, `CONVENTIONS.md` or the `Makefile`. No configuration key and no migration is added.

Shared files this task touches, owned by this task while it runs: `handler/server.go`, `handler/problem.go`, `handler/helpers_test.go`, `handler/router_test.go`, `domain/errors.go`, `usecase/fakes_test.go`, `cmd/server/main.go`. No other backend task runs now (`m3-e2e-journeys`, which changed `e2e/**` only, has merged). `m4-e2e-journeys` waits for this task.

## Operations used

From `docs/openapi.yaml`:

- `getPublicDashboard`: `GET /api/public/dashboard`, no parameters, no request body, `security: []`. Responses used: 200 (`PublicDashboard`: `{ services: PublicService[] }`, each with `name`, `status` (`healthy` or `unhealthy`) and `last_checked_at` (date-time), all required), 404 (`public_view_unavailable`), 429 (`rate_limited`, header `Retry-After`: integer, at least 1), 500 (`internal_error`). A stub today (501).

The contract lists no 401, 403, 422 or other status, no query parameter and no request header for this operation; none is added. Types come from `internal/api` (generated), used only in `handler/`.

## Behavior

### What exists

- `GET /api/public/dashboard` is the embedded stub's `GetPublicDashboard` (`handler/stubs.go`); `TestRouter_UnimplementedOperationAnswers501` calls it. Every other operation has a method on `*Server`.
- The policy router already makes the operation public (no session, no CSRF, no body rule) and resolves the client address into the request context.
- `memstore.Sessions` is the shape of a memstore type: it takes `pkg/clock.Clock`, a mutex, and removes expired entries when it is written to.
- `usecase.SettingsRepository.PublicViewEnabled` reads the view's switch. `ServiceRepository`'s `selectServicesSQL` and its row types serve the admin's list; the public query does not reuse them (see "The repository").

### The request, step by step

1. The policy router resolves the client address. The handler passes `middleware.RequestInfoFrom(ctx).ClientAddr` to the usecase unchanged. The handler reads no header itself.
2. The usecase asks the limiter whether this address may make a request now. If not, it returns `domain.RateLimitedError` (see below) and does nothing else: the setting and the services are not read.
3. The usecase reads the view's switch (`PublicViewEnabled`). Off: it returns `domain.ErrPublicViewUnavailable`.
4. On: it reads the public services (see "The repository") and returns them in that order.
5. The handler maps them to `api.PublicDashboard`.

**The order is the rate limit first, then the view switch.** Every request that gets past the limiter counts toward the limit, including one answered `404` (the requirement limits requests, not successful ones).

### The limiter (`memstore`)

New type `memstore.RateLimiter` in `memstore/ratelimit.go`: `NewRateLimiter(clock clock.Clock, limit int, window time.Duration) *RateLimiter`; `Allow(key string) (allowed bool, wait time.Duration)`; `Len() int` (how many keys it holds). It is safe for concurrent use and empty at every start (FR-114). It reads the time only from the clock it is given.

The rules, per key (the client address as a string; no normalization, no case folding):

- A window starts at the first request of a key when it has no window or its last window has ended, and ends `window` later. Requests are counted inside it.
- A request inside a window whose count is below `limit` is allowed and counted: with limit 3, the 1st, 2nd and 3rd are allowed. The 4th is not allowed, and is not counted (a refused request neither extends the window nor changes the count).
- When it is not allowed, `wait` is the time left until the window ends (end minus now; always greater than 0). When it is allowed, `wait` is 0.
- A window has ended when now is at or after its end: at exactly `start + window` the next request is allowed and starts a new window. One nanosecond earlier it is refused with `wait` of 1 ns.
- Keys are independent.
- Every call first removes the keys whose window has ended, as `Sessions.Put` removes expired sessions, so the map holds only addresses seen in the last window.
- The constructor does not validate `limit`; configuration guarantees at least 1.

### The usecase

New `usecase.PublicViewService` in `usecase/public_view.go`: `NewPublicViewService(limiter RateLimiter, settings SettingsRepository, services PublicServiceRepository) *PublicViewService` and `PublicDashboard(ctx, clientAddr string) ([]domain.PublicService, error)`. It defines two interfaces for what it needs (ARCHITECTURE.md, "Interfaces"): `RateLimiter` (`Allow(key string) (bool, time.Duration)`, satisfied by `memstore.RateLimiter` without importing `usecase`) and `PublicServiceRepository` (`ListPublic(ctx) ([]domain.PublicService, error)`). Both are at most two methods and used by this file only, so they sit inline in `public_view.go`. It reuses `SettingsRepository` from `settings.go` and takes no clock.

- Limited: it returns `domain.RateLimitedError{RetryAfterSeconds: n}` where `n` is `wait` rounded **up** to whole seconds, at least 1 (1 ns, 400 ms and 1 s give 1; 1.001 s gives 2; 59.5 s gives 60; 60 s gives 60).
- The view is off: `domain.ErrPublicViewUnavailable`.
- A failed read of the setting or of the services returns that error unchanged. It is never turned into `ErrPublicViewUnavailable` (the handler answers it `500`).
- A result of no services is an empty, non-nil slice.

### The repository

`ServiceRepository.ListPublic(ctx) ([]domain.PublicService, error)` in `repository/service_public.go`. One statement over `services` joined to `service_states` that returns exactly three columns, `services.name`, `service_states.status` and `service_states.last_checked_at`, into its own row type. It keeps a row only where `services.shown_on_public_view` is true, `services.paused` is false, `service_states.status` is `healthy` or `unhealthy`, and `service_states.last_checked_at` is not NULL (a status without a check time cannot be shown: `last_checked_at` is required by the contract). It orders by `services.name_key`, then `services.id`. Times are converted to UTC. It never returns nil. It does not read the app's public-view switch (the usecase does), and it does not select a URL, header, query parameter, body or any other column, so none can reach the response.

`domain.PublicService` (new, `domain/public_service.go`) has exactly three fields: `Name string`, `Status Status`, `LastCheckedAt time.Time`. The same file holds the constant `PublicRateLimitWindow = time.Minute` (the fixed window of FR-32; the number of requests is the configured one).

### The handler

New `handler/public_view.go` with `(*Server).GetPublicDashboard`. `handler.Server` gains a field `public PublicViewService` (its own field line) and `NewServer` its own argument `public PublicViewService`, placed after `auth` and before `log`. The interface `PublicViewService` in `server.go` has `PublicDashboard(ctx context.Context, clientAddr string) ([]domain.PublicService, error)`.

| Outcome of the usecase | Status | Body |
|---|---|---|
| services (or none) | 200 | `{"services":[{"name":…,"status":"healthy"\|"unhealthy","last_checked_at":…}, …]}`, in the usecase's order; `"services":[]` for none (never `null`) |
| `domain.ErrPublicViewUnavailable` | 404 | problem, code `public_view_unavailable`, title `Public view unavailable` |
| `domain.RateLimitedError` | 429 | problem, code `rate_limited`, title `Too many requests`, header `Retry-After: <RetryAfterSeconds>` |
| any other error | 500 | problem, code `internal_error`, no cause in the body (the existing mapping) |

The 404 is a new row in `domainProblems` (`problem.go`). The 429 is built in the handler as the generated typed response (the shared error handler cannot set a header); it does not go through `domainProblems`. `last_checked_at` is the time in UTC.

The handler writes no log line of its own for this operation: not for a served request, not for a refused one, never the client address (CONVENTIONS.md, Logging: addresses are left out). A `500` is logged by the existing shared error handler (`unexpected error`, with method and route, no address); that stays. The `429` body has no `detail`.

### Domain errors

In `domain/errors.go`: `ErrPublicViewUnavailable` ("the public view is off") and `RateLimitedError` (a struct with `RetryAfterSeconds int` and an `Error()` that says "rate limited"), the shape of `ValidationError`: the handler finds it with `errors.As`.

### Removing the 501 scaffolding (decided by the user)

`getPublicDashboard` was the last operation without an implementation, so nothing can answer 501 any more. In this task:

- Delete `handler/stubs.go`, the embedded `unimplemented` in `Server`, and the comments in `server.go` that describe the fall-through.
- In `problem.go` remove `ErrNotImplemented`, `codeNotImplemented` and the branch of `problemFor` that uses them.
- In `router_test.go` delete `TestRouter_UnimplementedOperationAnswers501`: its behavior is removed on purpose and no operation is left that could show it. This is the only test deleted.
- `*Server` must then implement every method of the generated strict interface by itself; the compiler checks it (`RegisterHandlers(…, NewStrictHandler(deps.Server, nil))`).

`ARCHITECTURE.md` (the paragraph on `unimplemented`) and `CONVENTIONS.md` (rule 2's "temporary `not_implemented`" sentence) become out of date; the builder does not edit them.

### Wiring (`cmd/server/main.go`)

Build the settings repository once and use it for the existing `SettingsService` and the new service; build `memstore.NewRateLimiter(clock.Real{}, cfg.Limits.PublicRateLimitPerMinute, domain.PublicRateLimitWindow)` once; build `usecase.NewPublicViewService(limiter, settingsRepo, serviceRepo)`; pass it to `handler.NewServer`. No literal 60 anywhere in the code. The startup log is unchanged. There is no test of `main.go`; the end-to-end task proves the wiring.

### Known gaps

- The counters live in memory: a restart gives every address a fresh window (FR-114).
- With proxy trust off, visitors behind one proxy or NAT share the proxy's address and one budget; the trusted-proxy case is milestone 5 (FR-99).
- The switch and the list are two reads, not one transaction: if the admin turns the view off between them, one response may still carry the list. The next request is `404`.
- An address is counted as the string the router resolved. Different textual forms of one IPv6 address, or the addresses of one subnet, count as different clients.
- Many different addresses in one window grow the limiter's map until their windows end; there is no other cap.
- A refused request is not logged, so an attack leaves no trace in the log.

## Structure

By `ARCHITECTURE.md`: the usecase decides, the repository stores, `memstore` holds the counters, the handler maps.

- New files, as named above: `domain/public_service.go`, `memstore/ratelimit.go`, `usecase/public_view.go`, `repository/service_public.go`, `handler/public_view.go`, each with its `_test.go` (one test file per source file; `domain/` needs none).
- `usecase/fakes_test.go`: a limiter double that returns the results a test scripts and records the keys it was asked for, a double for `PublicServiceRepository`, and the existing `fakeSettings` (it has no way to fail) gains an error field that makes `PublicViewEnabled` return it; do not add a second fake of `SettingsRepository`.
- `handler/helpers_test.go`: `publicViewSpy` (records the address it was given; returns scripted services or error), a `public` field in `routerOptions` with a default spy in `newRouter`, and the new `NewServer` argument.
- `repository/service_public_test.go` reuses the seeding helpers of `service_test.go` (`createAll`, `setState`, `httpService`) and `testutil.NewDB`.
- Names new to the repo: `memstore.RateLimiter`, `usecase.PublicViewService`, `usecase.RateLimiter`, `usecase.PublicServiceRepository`, `handler.PublicViewService`, `domain.PublicService`, `domain.PublicRateLimitWindow`, `domain.ErrPublicViewUnavailable`, `domain.RateLimitedError`, `ServiceRepository.ListPublic`.

## Dependencies

None. No `go.mod` or `go.sum` change.

## Acceptance criteria

Use non-default numbers and times (limit 3, not 60; a start time that is not midnight); the clock is `pkg/clock.Fake`. Repository tests use `testutil.NewDB(t)` (a real SQLite file). Concurrency tests run under `-race` with no `time.Sleep`. None is an integration test.

**Limiter (`memstore/ratelimit_test.go`)**

- Limit 3: the 1st, 2nd and 3rd request of a key are allowed with `wait` 0; the 4th is refused (FR-32).
- The refusal's `wait` is the time left: 60 s for the 4th at the window's start; after advancing 20 s, 40 s.
- Boundary: at `start + window - 1 ns` the request is still refused with `wait` 1 ns; at exactly `start + window` it is allowed and begins a new window (count 1; two more fit, the next is refused with `wait` of a full window less the time passed since the new start).
- A refused request does not extend the window: refused at 30 s and 40 s, allowed at 60 s.
- The window starts at the key's first request, not at construction: first request 5 minutes after the limiter was made; its window ends one window after that.
- Keys are independent: key A exhausted, key B allowed, and B's `wait` runs from B's own start.
- Expired keys are removed on the next call: 10 keys, advance one window, one `Allow` of another key, `Len()` is 1; before the advance it was 10.
- 200 goroutines on one key with limit 50: exactly 50 are allowed (under `-race`).

**Usecase (`usecase/public_view_test.go`)**

- Allowed and the view on: returns the repository's services in its order; the limiter was asked once with exactly the given client address; the services were read once.
- The view off: `ErrPublicViewUnavailable`, services not read; the same setup with the view on does read them (baseline).
- A request answered `404` still counted: the limiter was asked once (baseline for "every request counts").
- Limited: `RateLimitedError` whose `RetryAfterSeconds` is the rounded wait; neither the setting nor the services were read. With the view off and the limiter refusing, the result is `RateLimitedError`, not `ErrPublicViewUnavailable` (the limit is checked first).
- Rounding of the wait to seconds, as a table: 1 ns → 1, 400 ms → 1, 1 s → 1, 1.001 s → 2, 59.5 s → 60, 60 s → 60.
- A failed setting read returns that error and `errors.Is(err, ErrPublicViewUnavailable)` is false; a failed list read returns that error.
- No services: an empty, non-nil slice.

**Repository (`repository/service_public_test.go`)**

- Seed services so that exactly two qualify: shown and healthy; shown and unhealthy; and four that do not: shown and not yet checked, shown and paused with a stored status of healthy (FR-113), not shown and healthy, not shown and unhealthy. Only the two are returned (FR-28, FR-113).
- Names `Zulu`, `alpha`, `Bravo` (all shown, healthy) come back as `alpha`, `Bravo`, `Zulu` (FR-9's order, ignoring case).
- Each result has the stored name, the stored status and `LastCheckedAt` equal to the stored time, in UTC.
- A row with status healthy and a NULL `last_checked_at` (seeded directly) is not returned.
- Nothing seeded, or nothing qualifying: an empty, non-nil slice.

**Handler (`handler/public_view_test.go`)**

- 200: two services from the spy; the body decodes into a list of objects whose key set is exactly `name`, `status`, `last_checked_at`, in the spy's order, `last_checked_at` an RFC 3339 time in UTC; the response conforms (`testutil.AssertConforms(t, "getPublicDashboard", res)`) (FR-40, FR-63).
- 200 with none: the body is `{"services":[]}`, not `null`.
- 404: `ErrPublicViewUnavailable` gives status 404, content type `application/problem+json`, code `public_view_unavailable`, title `Public view unavailable`; conforms (FR-29).
- 429: `RateLimitedError{RetryAfterSeconds: 37}` gives status 429, header `Retry-After: 37`, code `rate_limited`, title `Too many requests`; conforms. With 1 the header is `1` (FR-32).
- 500: another error gives 500, code `internal_error`, and the error's text is not in the body; conforms.
- No session is needed and one does no harm: the same 200 without a cookie and with a valid session cookie; no `Set-Cookie` and no 401 either way.
- The address passed to the spy: with `RemoteAddr` `10.0.0.9:4000`, trust off, and an `X-Forwarded-For: 203.0.113.7, 198.51.100.4` header, it is `10.0.0.9`; with trust on it is `198.51.100.4` (FR-99: the router's address, not a header the handler read).
- No log line of the handler's own: after a 200 and a 429, the log output is empty. After a 500 the only line is the shared error handler's `unexpected error`, and it does not contain the client address.
- `TestRouter_Gate` and `TestRouter_PublicOperationsAreExactlyTheContracts` still pass with the new default spy. `TestRouter_UnimplementedOperationAnswers501` is deleted, and nothing else in `problem.go`'s mapping changes except the new 404 row and the removal of `not_implemented`.

**Repo-wide**

- `make check` passes (it builds the whole server, so `main.go` compiles with the new wiring).
- Nothing outside the allowed paths changed.

## Verifier checks

- **By reading:**
  - `ListPublic`'s statement selects only the three columns and has the four conditions; `domain.PublicService` has three fields; the handler maps those three and nothing else.
  - The usecase asks the limiter before it reads the setting.
  - The handler reads the address only from `RequestInfoFrom`, never from a header.
  - `memstore/ratelimit.go` has no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer`.
  - `main.go` passes `cfg.Limits.PublicRateLimitPerMinute` and `domain.PublicRateLimitWindow`; no literal 60 or `time.Minute` outside `domain/`.
  - The limiter's lock covers the prune, the count and the write.
  - Nothing logs an address.
  - `stubs.go` is gone, and `grep -rn "ErrNotImplemented\|not_implemented\|unimplemented" backend` finds nothing outside generated code.
  - The frontend's `Open` link and `/status` page need no change.
- **Mutation checks** (restore after each):
  - Check the view switch before the limiter, and see the "limit first" and "counted on 404" tests fail.
  - Change the limiter's `<` to `<=` and see the 1st-to-4th test fail.
  - Round the wait down, not up, and see the rounding table fail.
  - Drop `paused = false` or the status condition from `ListPublic` and see the repository test fail.
  - Order by `name`, not `name_key`, and see the ordering test fail.
  - Do not prune expired keys and see the `Len` test fail.
  - Remove the limiter's mutex and see the 200-goroutine test fail under `-race`.
  - Pass `RemoteAddr` instead of `ClientAddr`, and see the trust-on handler test fail.
  - Let the refused request extend the window, and see the "does not extend" test fail.
  - Return `nil` for no services and see the `[]` test fail.
- **Inputs to try:** limit 1 (the second request is refused); two addresses taking turns; an IPv6 client address (counted as the string the router resolved, no normalization: see Known gaps); a request with a session cookie; a `HEAD` and a `POST` to the path (answered by the router as not found, not by this operation); the window start at the last nanosecond. By hand, if wanted: run the app with `PUBLIC_RATE_LIMIT_PER_MINUTE=3`, turn the public view on in the app, `curl` the path four times and see `429` with `Retry-After`, then open `/status`. Say if it was not done.
- **Run it:** the `memstore`, `usecase` and `handler` packages three times under `-race`; report failures.
- **Docs or specs that no longer match** (report for the user): `ARCHITECTURE.md` ("Handlers and cross-cutting HTTP rules", the paragraph on embedded `unimplemented` stubs) and `CONVENTIONS.md` rule 2 (the temporary `not_implemented`). Also the `dashboard-public-switch` finding that the `Open` link led to a page whose API answered 501, now fixed.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other, or the contract lacks a status, header, field or code you need.
- You think you need a change outside your paths (a migration, a configuration key, the generated code, a dependency, the frontend).
- The code differs from "What exists" or "Prerequisite" (the names, `RequestInfoFrom`, the settings repository, the stub).
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` (and the integration-test command from `TESTING.md` if you touched code with integration tests; none is expected), commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), which tests ran, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle.
