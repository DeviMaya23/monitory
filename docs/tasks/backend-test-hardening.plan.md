# Plan: backend test hardening

Branch: `feat/backend-test-hardening`

## Baseline (item 1, reproduce first)

- `go test -race -count=1 ./internal/handler/` before any change: **67.4 s** (ok).
- CPU profile of that run: `operationRules` (via `NewRouter`, via the test helper `newRouter`) 11.6 s = 19.5%; `testutil.AssertConforms` 9.05 s = 15.2%; total about 35% of the samples, which matches the drafter's figure (above one fifth, so the premise holds). The test helper `operations` is three calls and negligible.
- Read-only check: `operationRules`' two maps are only read, by `policyRouter.add` (`router.go`, `p.public[...]`, `p.bodyRequired[...]`); nothing writes them after they are built.
- Read-only check: `AssertConforms` and `findOperation` only read the spec; the spec is passed to `routers.Route` and `openapi3filter.ValidateResponse` reads it (to be re-confirmed in kin-openapi's source, noted below).
- `operations(t)` callers (`router_test.go` lines 32, 44, 71) only range over the slice.

## Checklist

### Contract read once
- [x] `operationRules` memoized (`sync.OnceValues` in `loadOperationRules`) in `handler/router.go`; `NewRouter` unchanged. Commit "Read the embedded contract once...".
- [x] `handler/rules_test.go` (new): `TestOperationRules_AreReadOnceAndUnchanged`: same map pointers on two calls, literal contents. Mutation (a fresh map each call) fails it.
- [x] `operations(t)` memoized in `handler/helpers_test.go` (`contractOperations`, `sync.OnceValues` without `*testing.T`; `require` on the caller's `t`). Name, signature and result unchanged; the three callers only range.
- [x] `testutil/conformance.go`: `AssertConforms` reads the contract through `contract = sync.OnceValues(api.GetSwagger)`. By reading: `findOperation` only ranges over the spec, and `AssertConforms` only builds a `routers.Route` that points at it; nothing writes to the spec. (I did not read kin-openapi's `ValidateResponse` source line by line; the handler suite passes under `-race` with parallel use, which found no write.)
- [x] Handler suite passes `-race`: **2.8 s** after (`go test -race -count=1 ./internal/handler/`), against 67.4 s before. Also passes with `-shuffle=on`. Inside `make check` (all packages in parallel) it took 7.6 s.

### Timing-independent tests
- [x] `testutil/target_server_test.go` `TestTargetServer_DelayAndRedirect`: `fast < 100 ms`, its measurement and the now-unused `/fast` route removed; `slow >= 100 ms` kept.
- [x] `adaptor/probe/http_test.go` `TestCheckHTTP_Timeout`: healthy case (`/quick`) uses `longTimeout`.
- [x] Audit (table below). One further change: `TestCheckHTTP_CallerContext`' shared `check` (baseline) uses `longTimeout`.
- [x] `adaptor/probe` and `testutil` pass `-count=30 -race` (probe 98.8 s, testutil 17.0 s, no failure).
- [x] Same packages pass `-count=3 -race` under load: 8 `yes > /dev/null` loops (`sysctl -n hw.ncpu` = 8), probe 12.6 s, testutil 4.6 s, no failure. The loops were stopped afterwards (`pgrep -x yes` shows none).
- [x] Mutations (each restored): `TargetServer` ignoring `Route.Delay` fails `TestTargetServer_DelayAndRedirect`; the probe's timeout made `+1 h` fails `TestCheckHTTP_Timeout` (its 150 ms route against 50 ms, lines 191 and the failure helper).

### Mailpit test (`adaptor/mailer/mailer_integration_test.go`, `TestMailpit_DeliversTheAlert`)
- [x] No `DELETE /api/v1/messages` without an `IDs` body; recipient `integration-<16 hex from crypto/rand>@example.com`, made once per test (`uniqueRecipient`).
- [x] Search `GET /search?query=to:<address>` (query escaped), `require.Len(messages, 1)`, same message assertions as before. Query form and the `messages` / `messages_count` field names are **unverified against a running image** (no Mailpit available); the test uses `len(messages)`.
- [x] Deletes only its own id at the end of the body (asserts 200, then the search is empty) and again in `t.Cleanup` with its own 5 s context (result ignored).
- [x] Integration test (`make test-integration`): **not run: the Docker daemon is not running on this machine** (`Cannot connect to the Docker daemon`), and no `mailpit` binary is installed. The "second message already in the mailbox" check was therefore not run either. Compiles and vets with `-tags integration`; `golangci-lint --build-tags integration` is clean.

### Repo-wide
- [x] `make check`: run, passed (lint, contract lint, Go tests with `-race`, 1225 frontend tests, builds).
- [x] Nothing outside the allowed paths changed (`git diff --stat main` lists only the allowed files and this plan).

## Audit table

`adaptor/probe/http_test.go` (every test read; "fine" = no upper bound on speed and no healthy-path real deadline under `longTimeout`):

- `TestCheckHTTP_Status`, `RequestShape`, `RedirectLimit`, `RedirectToNotFound`, `ZeroTimeout`, `UnfollowedRedirectStatus`, `CouldNotConnect`, the invalid-request table, `CertificateProblem`, `TrustedRoots`, `NewConnectionPerAttempt`, `QueryParams`, `Headers`, `Body`, `RefusedHeader`, `RedirectsCarrySavedRequest`, `ConcurrentHeaders`, `JSONRules`, `JSONRuleModes`, `JSONBodyLimit`, `CertOptions_*`, `TestHTTP_StatusAndBody`, `TestHTTP_BodyLimit`: already `longTimeout` or no real deadline. Left.
- `TestCheckHTTP_Timeout`: healthy case changed to `longTimeout`; the 150 ms route against 50 ms, the silent listeners (100 ms) and `/late500` stay (a response later than the timeout).
- `TestCheckHTTP_TimeoutCoversRedirects`: failing case (two 40 ms hops, 80 ms in all, against 60 ms) stays; baseline already `longTimeout`. Left.
- `TestCheckHTTP_CallerContext`: baseline ("baseline returns a result", 100 ms delay, 500 ms timeout) now `longTimeout` through the shared `check`; the deadline subtest (20 ms caller deadline) still holds with the longer timeout. The "cancel while the server delays" subtest keeps its own 500 ms timeout: it ends by an explicit cancel after the request arrived, so a healthy path does not need that deadline. Left.
- `TestCheckHTTP_Concurrent`: `longTimeout`. Left.
- `TestCheckHTTP_RequestOutcome`: the 2 s route against 100 ms is a failure by lateness. Left.
- `TestCheckHTTP_JSONBodyReadInsideTimeout`: **left, for the user to decide.** Its 150 ms timeout must stay shorter than the body (3 times the timeout), which is the scenario; its "healthy without rules" case has to meet 150 ms, so it can fail on a very slow machine.
- `TestTestHTTP_SameVerdictAsCheckHTTP` and `TestTestHTTP_NoResponse`: the lateness cases (400 ms route against 100 ms) stay; the rest are `longTimeout`. Left.
- `TestTestHTTP_StalledBodyWithoutRules`: **left, for the user to decide.** `TestHTTP` reads the stalled body until the timeout, so the timeout has to be short; the headers must arrive within 150 ms, so it can fail on a very slow machine.
- `TestTestHTTP_CallerContext`: `longTimeout` plus lateness cases (60 ms against a 1 s route). Left. Contains an existing 50 ms `time.Sleep`, not mine.
- `TestCheckHTTP_NoRulesDoesNotReadStalledBody`: `longTimeout`. Left.

`testutil/target_server_test.go`:

- `TestTargetServer_DelayAndRedirect`: changed (above).
- `TestTargetServer_ScriptedAndUnscripted`, `RecordsRequests`, `HTTPS`: the only deadline is the helper's 2 s request context, equal to `longTimeout`; no upper bound on elapsed time. Left.

Seen, not touched (out of scope): `adaptor/probe/tcp_test.go` near line 219 asserts `assert.WithinDuration(..., 40*time.Millisecond)` on a stub's recorded deadline against `time.Now()`; it can fail on a loaded runner (not in the 8-loop run, which passed). Not reproduced by me beyond reading the task's note.

## Judgment calls

- Added a second helper-free change in `TestCheckHTTP_CallerContext`: its shared `check` (not only the baseline subtest) moved from 500 ms to `longTimeout`, because the baseline uses it; the other subtests that use it end by cancel or by a 20 ms caller deadline and are unaffected.
- `operationRules` keeps its signature `(public, bodyRequired, err)`; a small private `rulesPair` type and the `loadOperationRules` variable carry the memoized values.
- Removed the `/fast` route in `TestTargetServer_DelayAndRedirect` with the measurement, since nothing else used it.
- `TestMailpit_DeliversTheAlert`: the request helper `mailpitRequest` takes context and optional body; a JSON `Content-Type` is set when there is a body. The in-body delete is asserted with `require.NotNil` on the response and `StatusOK`.
- `-count=30` was run on the two packages together in one command; the load run likewise.
- Ran `npm ci` in `frontend/` (untracked `node_modules`) so `make check` could run the frontend lint and tests.
