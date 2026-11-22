# Verification report: backend test hardening

Branch: `verify/backend-test-hardening` (the builder's branch is `feat/backend-test-hardening`; this one starts at its tip `15980d1` and adds this report and one extra test).

Result: **no Blocking findings.** `make check`: run, passed (after `npm ci` in `frontend/`, a fresh checkout had no `node_modules`). Integration tests: **not run: the Docker daemon is not running on this machine** (`make test-integration` stops at `docker compose up`: `Cannot connect to the Docker daemon at unix:///Users/devi/.docker/run/docker.sock`).

## Acceptance criteria

| Criterion | Test / evidence | Real? | Verdict |
|---|---|---|---|
| `operationRules` returns the same maps on two calls, equal contents | `handler/rules_test.go` `TestOperationRules_AreReadOnceAndUnchanged` (pointer compare, both maps) | Yes. Mutation: a plain func instead of `sync.OnceValues` fails it ("bodyRequired is a fresh map") | Met |
| Contents of `public` and `bodyRequired` spelled out literally | same test; `public` = 3 keys, `bodyRequired` = 8 keys, as the task lists | Yes: `assert.Equal` on the whole map, so an extra or missing key fails | Met |
| Router behaves as before (gate, body tests unchanged) | `router_test.go` gate and body tests, unchanged in the diff, pass | Yes for the maps' contents (they drive the gate); they cannot tell cached from fresh, which the rules test does | Met |
| Handler suite faster; before/after in the plan; under 10 s | plan: 67.4 s before, 2.8 s after. I measured 3.2 s (`go test -race -count=1 ./internal/handler/`); 7.2 s inside `make check` | n/a (a timing, not a behavior). Mutation M2 below shows the time returns when a caller is un-memoized | Met |
| `AssertConforms` calls `api.GetSwagger()` only through the memoized one | `testutil/conformance.go`: `contract = sync.OnceValues(api.GetSwagger)`; `grep GetSwagger` outside `internal/api` shows only `contract`, `loadOperationRules` and `contractOperations` | By reading. Mutation M2: reverting it brings the suite back to 36.6 s, no test fails (as the task expects) | Met |
| Existing tests that use `AssertConforms` pass unchanged | handler suite, `make check` | n/a | Met |
| `TestTargetServer_DelayAndRedirect` has no upper bound; `slow >= 100 ms` kept | `testutil/target_server_test.go` | Yes. Mutation M3: server ignoring `Delay` fails it (`1.5ms is not >= 100ms`) | Met |
| `TestCheckHTTP_Timeout` healthy case uses `longTimeout` | `probe/http_test.go:192` | Yes. Mutation M4: probe timeout `+1h` fails it | Met |
| Plan lists each test the audit read, with a decision | plan "Audit table" | n/a | Met (see plan check) |
| Probe and testutil pass `-count=30 -race` | I ran it: probe 112 s ok, testutil 18.5 s ok | n/a | Met |
| Same packages pass `-count=3` under one busy loop per core | I ran it with 8 `yes > /dev/null` (`hw.ncpu` = 8): probe 12.7 s, testutil 4.5 s, ok; none left running (`pgrep -x yes` = 0) | n/a | Met |
| Mutations: ignore `Delay`, ignore the probe timeout | M3, M4 below | n/a | Met |
| Mailpit: no `DELETE /api/v1/messages` without `IDs`; random address; search and cleanup use only that address and id | `mailer_integration_test.go`: the only DELETE is `deleteOwn` with `{"IDs":["<id>"]}`; `uniqueRecipient` is `integration-` + 16 hex from `crypto/rand`; `search` queries `to:<recipient>`; the cleanup uses its own 5 s `context.Background()` context | By reading only; **would fail if the behavior were removed: yes when run** (it asserts `Len == 1` and an empty search after delete), but it was **not run** | Met by reading; run not possible |
| Mailpit: passes against Mailpit, and with a foreign message in the box beforehand | not run (Docker daemon down); the builder did not run it either | n/a | **Not verified.** The criterion is "if Docker is available"; it was not, for both builder and verifier |
| `make check` passes | run, passed | n/a | Met |
| Nothing outside the allowed paths changed | `git diff --stat main...HEAD`: the 7 allowed files plus the plan | n/a | Met |

Criteria that depend only on the integration test: the two Mailpit run criteria (passes against Mailpit; foreign message survives). The request shapes (`GET /api/v1/search?query=to:...`, `DELETE /api/v1/messages` with `{"IDs":[...]}`, field `messages`) match Mailpit's documented API as far as I know, but I could not confirm them against the `latest` image.

## Plan check

Plan: `docs/tasks/backend-test-hardening.plan.md`, read after the code review above.

- Every criterion of the task file is in the plan's checklist. None missing.
- Every ticked item has a test or evidence that exists and checks the behavior, with two notes:
  - "AssertConforms: nothing writes the spec" is backed in the plan by "the handler suite passes under `-race` with parallel use, which found no write". The handler tests do not call `t.Parallel` (no match in `handler` or `testutil`), so that run did not exercise concurrent use of the shared spec. I checked it myself: a throwaway test with 32 goroutines calling `AssertConforms` on the shared spec, `-race -count=3`, passed; I deleted it (there is no `conformance_test.go` to put it in). The plan also says it did not read kin-openapi's `ValidateResponse`; I did not either, my evidence is the race run.
  - "Mailpit passes" items are ticked as written, with the integration run recorded as not run. Honest.
- Plan against diff: the diff matches the plan (the `rulesPair` type, `loadOperationRules`, `contractOperations`, the `check` change in `TestCheckHTTP_CallerContext`, the removed `/fast` route). The plan's before/after times (67.4 s, 2.8 s) are consistent with mine (3.2 s).
- The task file says the drafter's expected "after" is under 10 s: met.

## Rule checks

- **Dependencies:** `go.mod`, `go.sum`, `STACK.md` untouched; imports added are `sync` (stdlib) and `crypto/rand`, `encoding/hex`, `net/url`, `io`, `strings` (stdlib). Pinned versions unchanged.
- **`router.go`:** differs from main only in `operationRules` (now a thin wrapper over a `sync.OnceValues`); `NewRouter`'s body and signature are unchanged; the error message `load the embedded contract: %w` is kept. Nothing writes the two maps (`router.go:93,96` write them inside the loader, before they are returned; `:132,:141` only read).
- **`operations`:** same name, signature and result; callers (`router_test.go`) only range over it.
- **No `time.Sleep` added** (the two in `http_test.go` at lines 1495 and 1538 are older). No assertion removed except the `fast < 100 ms` upper bound and its measurement. No timeout raised above what a healthy path needs (`longTimeout` for healthy cases only; the failing cases keep 50/60/100 ms).
- **Files changed:** only the allowed ones. `tcp_test.go`, `tcp.go`, `target_server.go`, generated code, Makefile, docs untouched.
- **CONVENTIONS.md:** layer boundaries, data scoping and transactions are not touched by a change that is only test code plus a memoization. Handler tests still import no `repository`.
- **Verifier checks from the task:** all read; the `TestCheckHTTP_CallerContext` shared `check` change leaves the 20 ms caller-deadline subtest and the cancel subtests valid (the deadline is still earlier than the 100 ms delay).
- **TESTING.md "Test files":** `rules_test.go` is the one new file the task allows; I added a test to it, created no `_edge` or `_regress` file.

## Mutation checks run (each restored with `git checkout`)

| # | Mutation | Result |
|---|---|---|
| M1 | `operationRules`' loader without `sync.OnceValues` | `TestOperationRules_AreReadOnceAndUnchanged` fails ("bodyRequired is a fresh map") |
| M2 | `AssertConforms` calls `api.GetSwagger()` each time | No test fails; handler suite time goes from 3.2 s to 36.6 s |
| M3 | `TargetServer` ignores `Route.Delay` (`testutil/target_server.go:164`) | `TestTargetServer_DelayAndRedirect` fails: `1.546ms is not greater than or equal to 100ms` |
| M4 | Probe timeout `check.Timeout + 1h` (`probe/http.go:135`) | `TestCheckHTTP_Timeout` fails (150 ms route against 50 ms no longer times out) |
| M5 | Mailpit search for another address | **Not run**: no Docker |

## Inputs tried beyond the task file

- `go test -race -count=3` for handler, probe and testutil: ok.
- Handler with `-shuffle=on`: ok. Handler with `-shuffle=on -count=2 -cpu=1,4`: ok.
- Probe and testutil with `-cpu=1`: ok.
- 32 concurrent first calls of `operationRules` under `-race -count=3`: same maps, no error. I added this as `TestOperationRules_ConcurrentCallsShareOneResult` in `handler/rules_test.go` (committed).
- 32 concurrent `AssertConforms` calls on the shared spec under `-race -count=3`: passed (not committed, see plan check).
- The `slow >= 100 ms` boundary: a delay of exactly 100 ms is the route's own delay and the timer cannot fire early, so the lower bound cannot flake. The probe's failing case is 150 ms against 50 ms (a 100 ms margin), both directions of the margin are fine on a slow machine because the response is only ever later.

## Findings

### Blocking

None.

### Non-blocking

1. **The Mailpit test has never run, and its query form is unverified.** Category: test quality. Matters when: CI runs `make test-integration` for this branch (the first real run). If the `latest` image answers a search differently (query form or the `messages` field), that run is where it shows; fix the test then. Not reproduced: no Docker.
2. **Two probe tests keep a real 150 ms deadline that a healthy path must meet** (`TestCheckHTTP_JSONBodyReadInsideTimeout`, `TestTestHTTP_StalledBodyWithoutRules`), left on purpose by the builder because raising it changes the scenario. Category: decision needed. Matters when: CI runner is much slower than an 8-core laptop under 8 busy loops (the loaded run passed). Left for the user, as the task asks.
3. **`tcp_test.go` asserts `WithinDuration(..., 40ms)` against `time.Now()`** (around line 219, out of scope). Category: latent bug (test flake). Matters when: a loaded CI runner delays the stub's recorded deadline by more than 40 ms. Not reproduced by me; it passed in the loaded runs.
4. **`sync.OnceValues` caches the error from `api.GetSwagger()`** in `loadOperationRules`, `contractOperations` and `contract`. Category: latent bug. Matters when: the embedded contract could fail to load at run time (it cannot: it is embedded and parsed the same way every call). Report only otherwise.
5. **Mailpit test: if the search finds the wrong number of messages, the cleanup has no id and removes nothing.** Category: test quality. Matters when: two messages ever match the unique address, which cannot happen with 64 random bits. Report only.

## Docs or specs that no longer match

- `docs/openapi.yaml`, `docs/requirements.md`: nothing; no behavior changed.
- `STACK.md`: no version adopted, no dependency added. Nothing to record.
- `TESTING.md`: "Adaptor tests against a local stub server may use real deadlines of at most 200 ms to exercise a timeout" now has the companion rule this task applied (a deadline a healthy path must meet is `longTimeout`). The user may want to add that sentence; not required.
- `docs/tasks/backlog.md`: the three loose ends this task closes (handler suite slowness, probe/test-server wall-clock bounds, Mailpit mailbox clearing) can leave "Loose ends" once it merges, if they are listed there. I did not edit the backlog.
