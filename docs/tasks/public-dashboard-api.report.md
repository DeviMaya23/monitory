# Verification report: public dashboard API

Branch: `verify/public-dashboard-api` (the session's branch, reset onto the builder's `feat/public-dashboard-api` at `68cc998`, plus the verifier's commit).
Verdict: **no Blocking findings.** One test gap found and closed by the verifier with new test rows (no source changed).

## Results at a glance

| Check | Result |
|---|---|
| `make check` | passed (exit 0). First attempt failed only because this fresh worktree had no frontend dependencies (`eslint: command not found`); after `npm ci` in `frontend/` it passed, before and after the verifier's test additions |
| `memstore`, `usecase`, `handler` ×3 under `-race` | passed (`-count=3`); `repository` once under `-race`, passed |
| Integration tests (`make test-integration`) | **not run**: the task touches no code that has integration tests (only `adaptor/mailer` does; Docker is available but nothing here depends on Mailpit). Every criterion is covered by unit and repository tests; none depends only on an integration test |
| Built app, live run | **run** (section "Live run" below) |

## 1. Acceptance criteria

"Real?" = would the named test fail if the behavior were removed? "Yes (M)" means I proved it by a mutation (section 4); "Yes (read)" means by reading only.

### Limiter (`memstore/ratelimit_test.go`)

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| L1 | Limit 3: 1st–3rd allowed, wait 0; 4th refused (FR-32) | `TestRateLimiter_AllowsUpToTheLimitThenRefuses` | Yes (M: `>=`→`>`) | Met |
| L2 | Refusal's wait is the time left: 60 s, then 40 s | `TestRateLimiter_WaitIsTheTimeLeftInTheWindow` | Yes (M: refusal extends window) | Met |
| L3 | Boundary: `start+window-1ns` refused with 1 ns; exactly `start+window` allowed, new window | `TestRateLimiter_WindowEndsAtExactlyItsLength` | Yes (M: end made inclusive) | Met |
| L4 | Refused request does not extend the window | `TestRateLimiter_RefusedRequestDoesNotExtendTheWindow` | Yes (M) | Met |
| L5 | Window starts at the key's first request, not construction | `TestRateLimiter_WindowStartsAtTheFirstRequestNotAtConstruction` | Yes (M: no-prune also fails it) | Met |
| L6 | Keys independent; B's wait from B's start | `TestRateLimiter_KeysAreIndependent` | Yes (M: extend-window fails it) | Met |
| L7 | Expired keys removed on next call (`Len` 10 → 1) | `TestRateLimiter_ExpiredKeysAreRemovedOnTheNextCall` | Yes (M: no prune) | Met |
| L8 | 200 goroutines, limit 50: exactly 50 allowed, `-race` | `TestRateLimiter_ConcurrentRequestsOfOneKeyAreCountedExactly` | Yes (M: mutex removed) | Met |

### Usecase (`usecase/public_view_test.go`)

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| U1 | Allowed + view on: services in order, limiter asked once with the exact address, services read once | `TestPublicView_ReturnsTheRepositorysServicesInItsOrder` | Yes (read: asserts keys and read counts) | Met |
| U2 | View off: `ErrPublicViewUnavailable`, services not read; baseline with view on | `TestPublicView_ViewOffIsUnavailableAndStillCounted` | Yes (M: switch before limiter fails it) | Met |
| U3 | A 404 still counted (limiter asked once) | same test | Yes (M) | Met |
| U4 | Limited: `RateLimitedError`; setting and services not read; limit before view switch | `TestPublicView_LimitedReadsNothingElse`, `TestPublicView_LimitIsCheckedBeforeTheViewSwitch` | Yes (M: both fail) | Met |
| U5 | Rounding table (1 ns→1 … 60 s→60) | `TestPublicView_RetryAfterIsTheWaitRoundedUpToWholeSeconds` | Yes (M: round down) | Met |
| U6 | Failed setting read / list read returned unchanged, not 404 | `TestPublicView_FailedReadsAreNotTheViewBeingOff` | Yes (read: asserts the error and `errors.Is(...)` false) | Met |
| U7 | No services: empty, non-nil slice | `TestPublicView_NoServicesIsAnEmptyNonNilSlice` | Yes (M: nil) | Met |

### Repository (`repository/service_public_test.go`)

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| R1 | Exactly the two qualifying services of six seeded (FR-28, FR-113) | `TestServiceListPublic_ReturnsOnlyShownUnpausedCheckedServices` | Yes for `shown` (M), `paused` (M). **The `status IN (...)` condition could be dropped and this test still passed** (see N1) | Met (condition 3 of 4 was unpinned until the verifier's row) |
| R2 | `alpha`, `Bravo`, `Zulu` order ignoring case | `TestServiceListPublic_OrdersByNameIgnoringCase` | Yes (M: `ORDER BY name`) | Met |
| R3 | Stored name, status, time equal, in UTC | `TestServiceListPublic_ReturnsTheStoredValuesInUTC` | Yes (M: `.UTC()` removed) | Met |
| R4 | Healthy with NULL `last_checked_at` not returned | `TestServiceListPublic_HealthyWithoutACheckTimeIsNotReturned` | Yes (M: `IS NOT NULL` dropped) | Met |
| R5 | Nothing / nothing qualifying: empty, non-nil | `TestServiceListPublic_NothingQualifyingIsAnEmptyNonNilSlice` | Yes (read: `assert.NotNil`; the make-slice is what guarantees it) | Met |

### Handler (`handler/public_view_test.go`)

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| H1 | 200: exact key set `name`/`status`/`last_checked_at`, order, RFC 3339 UTC, conforms (FR-40, FR-63) | `TestGetPublicDashboard_ReturnsOnlyNameStatusAndLastCheckedAt`, `…_TimeIsInUTC` | Yes (M: `.UTC()` removed; key-set check fails on any extra field by reading) | Met |
| H2 | 200 empty: `{"services":[]}` | `TestGetPublicDashboard_NoServicesIsAnEmptyList` (nil and empty rows) | Yes (M: nil slice → `null`) | Met |
| H3 | 404: status, content type, code, title; conforms (FR-29) | `TestGetPublicDashboard_ViewOffIs404` | Yes (M: `domainProblems` row removed) | Met |
| H4 | 429: `Retry-After` 37 and 1, code, title; conforms (FR-32) | `TestGetPublicDashboard_RateLimitedIs429WithRetryAfter` | Yes (M: header dropped; header fixed to 60) | Met |
| H5 | 500: code, error text not in body; conforms | `TestGetPublicDashboard_OtherErrorIs500WithoutItsText` | Yes (read: asserts `NotContains`) | Met |
| H6 | No session needed; one does no harm; no `Set-Cookie` | `TestGetPublicDashboard_NeedsNoSessionAndASessionDoesNoHarm` | Partly: a handler that required a session would fail it; but the router makes the operation public, so it mostly pins the router | Met (FR-4, FR-96) |
| H7 | Address passed is the router's (`10.0.0.9` trust off, `198.51.100.4` trust on) (FR-99) | `TestGetPublicDashboard_PassesTheRoutersClientAddress` | Yes (M: a constant address fails the trust-on row) | Met |
| H8 | No log line of its own; a 500 leaves only `unexpected error`, no address | `TestGetPublicDashboard_LogsNothingOfItsOwn` | Yes (read: asserts empty log and a one-line log; a log call in the handler would fail it) | Met |
| H9 | `TestRouter_Gate`, `TestRouter_PublicOperationsAreExactlyTheContracts` pass; 501 test deleted; mapping unchanged apart from the 404 row and `not_implemented` removal | `router_test.go`, `problem.go` diff | Yes (both pass in `make check`; `git diff` shows only the one test deleted) | Met |

### Repo-wide

| Criterion | Evidence | Status |
|---|---|---|
| `make check` passes | exit 0, twice (see top) | Met |
| Nothing outside the allowed paths changed | `git diff 5c4412c..HEAD --name-only`: every path is in the task's list, plus `docs/tasks/public-dashboard-api.plan.md`; `go.mod`, `go.sum`, `api/`, `migration/`, `platform/`, frontend, `e2e/`, docs untouched | Met |

## 2. Plan check (`public-dashboard-api.plan.md`, read after the criteria)

- **Every criterion of the task file appears in the plan.** None missing.
- **The test names in the plan do not match the code** for most items (for example the plan says `TestRateLimiter_WaitIsTimeLeft`, the code has `TestRateLimiter_WaitIsTheTimeLeftInTheWindow`; `TestServiceRepository_ListPublic_Filters` vs `TestServiceListPublic_ReturnsOnlyShownUnpausedCheckedServices`). The plan admits the names are approximate. Each ticked item does have a real test that checks the behavior, found by the file named next to its group. See N2.
- The plan ticks the repository filter item as covering the whole `WHERE` clause. One of the four conditions (status) was not pinned (N1).
- Differences between plan and diff: none else. The judgment calls it lists (404 as a `domainProblems` row, integer ceiling, `fakeSettings.reads`, `readBody` reuse, `1`/`0` booleans) match the diff.
- The plan says the first `make check` run had a frontend timeout in `AddServiceForm.test.tsx`. Mine passed on the first run after `npm ci`.

## 3. Rule checks (by reading the diff)

| Rule | Result |
|---|---|
| Dependencies: nothing beyond the task's list; pinned versions unchanged | None added; `go.mod`/`go.sum`/`package*.json` not in the diff |
| Layer boundaries (CONVENTIONS.md, ARCHITECTURE.md) | `memstore` imports only `pkg/clock`; `usecase` defines `RateLimiter` and `PublicServiceRepository` inline and imports no `memstore`/`repository`/`api`; `api.*` types used only in `handler/`; `main.go` wires |
| Usecase asks the limiter before the setting | Yes (`public_view.go:44`); mutation confirmed |
| Handler reads the address only from `RequestInfoFrom` | Yes; no `Header`, no `RemoteAddr` in `public_view.go` |
| `ListPublic` selects three columns, has the four conditions; `domain.PublicService` has three fields; handler maps three | Yes to all (`selectPublicSQL`; `publicRow` has 3 fields) |
| `ratelimit.go` has no `time.Now`/`Sleep`/`After`/`NewTimer` | grep: none |
| `main.go` passes `cfg.Limits.PublicRateLimitPerMinute` and `domain.PublicRateLimitWindow`; no literal 60 / `time.Minute` outside `domain/` | Yes; `time.Minute` appears only in `domain/public_service.go` and `domain/limits.go` (and a test cert helper) |
| Limiter's lock covers prune, count and write | Yes: `defer Unlock` right after `Lock`, held through the whole function |
| Nothing logs an address | grep for `slog`/`log.` in the three new source files: none |
| `stubs.go` gone; no `ErrNotImplemented`/`not_implemented`/`unimplemented` in backend outside generated code | grep: nothing; `stubs.go` deleted |
| Frontend `Open` link and `/status` need no change | No frontend file in the diff; the live run shows the real endpoint answering as the page expects |
| Data scoping / transactions | `ListPublic` is one read statement; no write, no transaction needed. The two-read gap (switch, list) is in the task's Known gaps |
| Domain error style | `RateLimitedError` is found with `errors.As` like `ValidationError`; `ErrPublicViewUnavailable` goes through `domainProblems` |

## 4. Mutation checks run

Each one: break the source, run the named test under `-race`, confirm failure, `git checkout` the file.

| Mutation | Test that failed |
|---|---|
| View switch before limiter | `TestPublicView_LimitIsCheckedBeforeTheViewSwitch`, `…_LimitedReadsNothingElse`, `…_ViewOffIsUnavailableAndStillCounted` |
| Limiter `>=` → `>` (the `<`→`<=` of the task) | 8 limiter tests, including the 1st-to-4th test |
| Round wait down | `TestPublicView_RetryAfterIsTheWaitRoundedUpToWholeSeconds` |
| Drop `paused = 0` | `TestServiceListPublic_ReturnsOnlyShownUnpausedCheckedServices` |
| Drop `status IN (...)` | **none failed** (survived). Closed by the verifier's new row, which then fails |
| Drop `last_checked_at IS NOT NULL` | `…_HealthyWithoutACheckTimeIsNotReturned` |
| Drop `shown_on_public_view` | `…_ReturnsOnlyShownUnpausedCheckedServices`, `…_NothingQualifying…` |
| `ORDER BY name` instead of `name_key` | `…_OrdersByNameIgnoringCase` |
| No pruning of expired keys | `…_ExpiredKeysAreRemovedOnTheNextCall` (plus three window tests) |
| Remove the mutex | `…_ConcurrentRequestsOfOneKeyAreCountedExactly`; also the new many-keys test |
| Refused request extends the window | `…_RefusedRequestDoesNotExtendTheWindow` and three more |
| Window end made inclusive (`Before`→`After`) | `…_WindowEndsAtExactlyItsLength` and three more |
| Handler uses a non-router address (constant, since `RequestInfo` has only `ClientAddr`) | `…_PassesTheRoutersClientAddress/trust_on` |
| Return nil for no services (usecase) | `TestPublicView_NoServicesIsAnEmptyNonNilSlice` |
| Return nil for no services (handler: `var out` + `append`) | `TestGetPublicDashboard_NoServicesIsAnEmptyList` (both `nil` and `empty` rows) |
| Drop `.UTC()` in handler / in repository | `…_TimeIsInUTC` / `…_ReturnsTheStoredValuesInUTC` |
| 429 without `Retry-After`; `Retry-After` fixed at 60 | `…_RateLimitedIs429WithRetryAfter` |
| Remove the 404 row in `domainProblems` | `…_ViewOffIs404` |
| Remove the `max(seconds, 1)` floor | **survived** at first (unreachable from the limiter, which never refuses with a wait ≤ 0). Closed by the verifier's `{0, 1}` row, which then fails |

(My first handler nil mutation indexed a nil slice and panicked, which proved nothing; I redid it with `append` and the table row above is that result.)

## 5. Edge cases tried (beyond the task's list)

Added as rows or tests in the existing files (all pass, mutation-checked where noted):

- `usecase/public_view_test.go`: rounding row `0 → 1` (the floor).
- `repository/service_public_test.go`: `TestServiceListPublic_NotYetCheckedWithACheckTimeIsNotReturned` (status `not_yet_checked` with a stored check time; the schema allows it).
- `memstore/ratelimit_test.go`: `TestRateLimiter_KeysAreExactStringsAndTakeTurnsIndependently` (limit 1; three spellings of one IPv6 address plus an IPv4 address are four clients; two addresses taking turns; refusals report a full window), and `TestRateLimiter_ConcurrentRequestsOfManyKeysAreCountedPerKey` (200 goroutines over 20 keys, limit 5, exactly 100 allowed, `Len` 20; fails without the mutex).
- `handler/public_view_test.go`: `TestGetPublicDashboard_OtherMethodsDoNotReachTheOperation` (POST, PUT, DELETE, HEAD answer 404 or 405 from the router and the usecase is not asked, so nothing is counted).

Already covered by the builder's tests and re-checked by mutation: limit 1, the window-end boundary at 1 ns, the window starting at the first request.

### Live run (built binary, temp database, `REQUIRE_HTTPS=false`, `PUBLIC_RATE_LIMIT_PER_MINUTE=3`, own port, stopped afterwards)

- View off (default): requests 1–3 answer `404 {"code":"public_view_unavailable",...}`; request 4 answers `429` with `Retry-After: 60` and `{"code":"rate_limited",...}`. This confirms in the real server that a 404 counts and the configured number (3, not 60) is used.
- After a restart (fresh counters), signed in, view turned on through `PUT /api/settings/public-view`: `GET` with a session cookie answers `200 {"services":[]}` with no `Set-Cookie`; `HEAD` and `POST` on the path answer `404` and were not counted (the following requests, 2 and 3, were both `200`, as the limit of 3 predicts).
- Not done: a service with a stored status through the real checker, and the `/status` page in a browser. The page and the services list are covered by the repository, handler and the already merged frontend tests; the end-to-end journeys are `m4-e2e-journeys`.

## 6. Findings

### Blocking

None.

### Non-blocking

**N1. The `status IN ('healthy','unhealthy')` condition of `ListPublic` was unpinned (test quality).** Dropping it left every builder test green, although the task's own mutation list expects a failure. In today's data a status other than the two comes with a NULL check time, which the `IS NOT NULL` condition already excludes, so no current input is wrong. **Fixed in this branch** by a new test (`…_NotYetCheckedWithACheckTimeIsNotReturned`); the mutation now fails it. Matters when: a later task stores a check time for a service whose status is `not_yet_checked` (for example on resume or on an edit that resets the state).

**N2. Plan lists test names that do not exist (test quality, cosmetic).** The plan's ticks name tests approximately; the real names differ. Matters when: someone greps a plan item to find its test, or an agent trusts the name as proof. Report only.

**N3. The limiter prunes by scanning the whole map on every call, under the one lock (latent bug, performance).** Cost grows with the number of distinct addresses seen in the last minute. Matters when: many distinct addresses hit the public path in one minute (tens of thousands), which makes each request slow and holds the lock for all visitors. The task's Known gaps accept the unbounded map but not this per-request scan; report only unless a trigger shows up.

**N4. The rounding floor `max(seconds, 1)` is unreachable from the real limiter (cosmetic).** The limiter never refuses with a wait ≤ 0, so the floor is defensive. It is now pinned by a `0 → 1` row. Matters when: the limiter is replaced by one that can return a zero wait. Report only.

**N5. `TestGetPublicDashboard_NeedsNoSessionAndASessionDoesNoHarm` mostly tests the router (test quality).** The handler never reads the session, so only a router change would break it. Report only.

## 7. Docs or specs that no longer match

- `ARCHITECTURE.md` line 114 ("Handlers and cross-cutting HTTP rules"): says operations not yet implemented fall through to embedded `unimplemented` stubs in `stubs.go` and answer 501, and that a method "shadows the stub". `stubs.go` and `unimplemented` are gone; no operation answers 501.
- `CONVENTIONS.md` rule 2: "a temporary `not_implemented` for stubs is the only exception" to using codes from the spec. The code and its constant are removed; the exception can go.
- `docs/tasks/dashboard-public-switch.report.md` N4 and `docs/tasks/public-dashboard-screen.report.md` (the `Open` link led to an API that answered 501, and "manual checks due once the backend merges") are historical and now resolved by this merge. Nothing to edit in them; the `docs/manual-checks.md` items for the public page become possible to run once this merges.
- `docs/tasks/backlog.md` line 35 (FR-99 "Left: the journey with trust on") stays accurate.
- `docs/openapi.yaml`, `docs/requirements.md`: no difference found; the operation answers exactly the contract's 200, 404, 429 (with `Retry-After`) and 500.
- `STACK.md`: no version adopted (no dependency added), and its "Rate limiting" row (hand-rolled, fixed window per address, in memory, injected clock) matches what was built.
