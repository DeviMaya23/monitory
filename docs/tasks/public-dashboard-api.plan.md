# Plan: public dashboard API

Branch: feat/public-dashboard-api

## Acceptance criteria

### Limiter — `backend/internal/memstore/ratelimit.go`, test `ratelimit_test.go`
- [x] Limit 3: 1st–3rd allowed with wait 0, 4th refused (`TestRateLimiter_AllowsUpToTheLimitThenRefuses`)
- [x] Refusal's wait is time left: 60 s, then 40 s after 20 s (`TestRateLimiter_WaitIsTimeLeft`)
- [x] Boundary: `start+window-1ns` refused with 1 ns; exactly `start+window` allowed, new window (`TestRateLimiter_WindowBoundary`)
- [x] Refused request does not extend the window (`TestRateLimiter_RefusalDoesNotExtendWindow`)
- [x] Window starts at the key's first request, not at construction (`TestRateLimiter_WindowStartsAtFirstRequest`)
- [x] Keys are independent (`TestRateLimiter_KeysAreIndependent`)
- [x] Expired keys removed on next call, `Len` (`TestRateLimiter_PrunesExpiredKeys`)
- [x] 200 goroutines, limit 50, exactly 50 allowed under -race (`TestRateLimiter_Concurrent`)

### Usecase — `backend/internal/usecase/public_view.go`, test `public_view_test.go`
- [x] Allowed + view on: services in order, limiter asked once with the address, services read once (`TestPublicView_ReturnsServices`)
- [x] View off: `ErrPublicViewUnavailable`, services not read; baseline with view on (`TestPublicView_ViewOff`)
- [x] 404 still counted: limiter asked once (`TestPublicView_ViewOff`)
- [x] Limited: `RateLimitedError`, nothing else read; limit checked before view switch (`TestPublicView_Limited`)
- [x] Wait rounding table (`TestPublicView_RetryAfterRounding`)
- [x] Failed setting read / list read returned, not 404 (`TestPublicView_ReadErrors`)
- [x] No services: empty non-nil slice (`TestPublicView_NoServices`)

### Repository — `backend/internal/repository/service_public.go`, test `service_public_test.go`
- [x] Only the two qualifying services returned (`TestServiceRepository_ListPublic_Filters`)
- [x] Order by name ignoring case (`TestServiceRepository_ListPublic_Order`)
- [x] Stored name, status, UTC time (`TestServiceRepository_ListPublic_Fields`)
- [x] Healthy with NULL `last_checked_at` not returned (`TestServiceRepository_ListPublic_NullCheckTime`)
- [x] Nothing qualifying: empty non-nil slice (`TestServiceRepository_ListPublic_Empty`)

### Handler — `backend/internal/handler/public_view.go`, test `public_view_test.go`
- [x] 200 with exact key set, order, UTC, conforms (`TestGetPublicDashboard_OK`)
- [x] 200 empty: `{"services":[]}` (`TestGetPublicDashboard_Empty`)
- [x] 404 problem, conforms (`TestGetPublicDashboard_ViewUnavailable`)
- [x] 429 with Retry-After 37 and 1, conforms (`TestGetPublicDashboard_RateLimited`)
- [x] 500 no cause in body, conforms (`TestGetPublicDashboard_InternalError`)
- [x] No session needed, one does no harm (`TestGetPublicDashboard_NoSessionNeeded`)
- [x] Address passed is the router's ClientAddr, trust off and on (`TestGetPublicDashboard_ClientAddr`)
- [x] No log line of its own; 500 only shared line without address (`TestGetPublicDashboard_Logging`)
- [x] `TestRouter_Gate` and `TestRouter_PublicOperationsAreExactlyTheContracts` still pass; `TestRouter_UnimplementedOperationAnswers501` deleted; 501 scaffolding removed (`router_test.go`)

### Repo-wide
- [x] `make check` passes (second run; the first had one frontend timeout in `AddServiceForm.test.tsx` under load, which passes alone and on rerun; no frontend file changed)
- [x] Nothing outside allowed paths changed (`git diff --stat main`)
- [x] Integration tests (`make test-integration`): not run: the task touches no code with integration tests (only the mailer has them)

## Judgment calls

- The test names in the checklist above are approximate; the real ones are in the `_test.go` files named next to each group. Handler 404 is a row in `domainProblems`; only the 429 is built in the handler.
- The usecase's `RateLimitedError` rounding uses integer ceiling division of `wait`, with a floor of 1.
- `TestRouter_Gate` / `TestRouter_PublicOperationsAreExactlyTheContracts` needed no change beyond the default spy.
- Test helper: the handler test reuses `readBody` from `session_test.go` (returns a string) instead of defining a second one.
- `fakeSettings` also gained a `reads` counter (beside the requested error field) to assert the setting is not read when limited.
- The repository SQL compares booleans to `1`/`0` (SQLite storage); the "ties" order is `name_key`, then `id`.
- Handler test for the 500 asserts the log line has no address by giving the request a known `RemoteAddr`.
- Frontend deps were installed with `npm ci` to run `make check` (no tracked file changed).
- Not done by hand: the `curl` run with `PUBLIC_RATE_LIMIT_PER_MINUTE=3` and opening `/status`.
- Docs that are now out of date (not edited, for the user): `ARCHITECTURE.md` (embedded `unimplemented` paragraph), `CONVENTIONS.md` rule 2 (`not_implemented`).
