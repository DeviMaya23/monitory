# Plan: public dashboard API

Branch: feat/public-dashboard-api

## Acceptance criteria

### Limiter — `backend/internal/memstore/ratelimit.go`, test `ratelimit_test.go`
- [ ] Limit 3: 1st–3rd allowed with wait 0, 4th refused (`TestRateLimiter_AllowsUpToLimit`)
- [ ] Refusal's wait is time left: 60 s, then 40 s after 20 s (`TestRateLimiter_WaitIsTimeLeft`)
- [ ] Boundary: `start+window-1ns` refused with 1 ns; exactly `start+window` allowed, new window (`TestRateLimiter_WindowBoundary`)
- [ ] Refused request does not extend the window (`TestRateLimiter_RefusalDoesNotExtendWindow`)
- [ ] Window starts at the key's first request, not at construction (`TestRateLimiter_WindowStartsAtFirstRequest`)
- [ ] Keys are independent (`TestRateLimiter_KeysAreIndependent`)
- [ ] Expired keys removed on next call, `Len` (`TestRateLimiter_PrunesExpiredKeys`)
- [ ] 200 goroutines, limit 50, exactly 50 allowed under -race (`TestRateLimiter_Concurrent`)

### Usecase — `backend/internal/usecase/public_view.go`, test `public_view_test.go`
- [ ] Allowed + view on: services in order, limiter asked once with the address, services read once (`TestPublicView_ReturnsServices`)
- [ ] View off: `ErrPublicViewUnavailable`, services not read; baseline with view on (`TestPublicView_ViewOff`)
- [ ] 404 still counted: limiter asked once (`TestPublicView_ViewOff`)
- [ ] Limited: `RateLimitedError`, nothing else read; limit checked before view switch (`TestPublicView_Limited`)
- [ ] Wait rounding table (`TestPublicView_RetryAfterRounding`)
- [ ] Failed setting read / list read returned, not 404 (`TestPublicView_ReadErrors`)
- [ ] No services: empty non-nil slice (`TestPublicView_NoServices`)

### Repository — `backend/internal/repository/service_public.go`, test `service_public_test.go`
- [ ] Only the two qualifying services returned (`TestServiceRepository_ListPublic_Filters`)
- [ ] Order by name ignoring case (`TestServiceRepository_ListPublic_Order`)
- [ ] Stored name, status, UTC time (`TestServiceRepository_ListPublic_Fields`)
- [ ] Healthy with NULL `last_checked_at` not returned (`TestServiceRepository_ListPublic_NullCheckTime`)
- [ ] Nothing qualifying: empty non-nil slice (`TestServiceRepository_ListPublic_Empty`)

### Handler — `backend/internal/handler/public_view.go`, test `public_view_test.go`
- [ ] 200 with exact key set, order, UTC, conforms (`TestGetPublicDashboard_OK`)
- [ ] 200 empty: `{"services":[]}` (`TestGetPublicDashboard_Empty`)
- [ ] 404 problem, conforms (`TestGetPublicDashboard_ViewUnavailable`)
- [ ] 429 with Retry-After 37 and 1, conforms (`TestGetPublicDashboard_RateLimited`)
- [ ] 500 no cause in body, conforms (`TestGetPublicDashboard_InternalError`)
- [ ] No session needed, one does no harm (`TestGetPublicDashboard_NoSessionNeeded`)
- [ ] Address passed is the router's ClientAddr, trust off and on (`TestGetPublicDashboard_ClientAddr`)
- [ ] No log line of its own; 500 only shared line without address (`TestGetPublicDashboard_Logging`)
- [ ] `TestRouter_Gate` and `TestRouter_PublicOperationsAreExactlyTheContracts` still pass; `TestRouter_UnimplementedOperationAnswers501` deleted; 501 scaffolding removed (`router_test.go`)

### Repo-wide
- [ ] `make check` passes
- [ ] Nothing outside allowed paths changed (`git diff --stat main`)
- [ ] Integration tests: not run yet (task touches no integration-tested code)

## Judgment calls
