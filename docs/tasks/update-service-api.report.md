# Verification report: update-service API

**Branch:** `verify/update-service-api` (the builder's `feat/update-service-api` at fff52a5, plus one verifier test)
**Verdict:** no Blocking findings. Five Non-blocking findings, one of them a test gap found by mutation and closed here.

## Commands run

| Command | Result |
|---|---|
| `make check` | run, passed (exit 0; `npm ci` in `frontend/` first, the worktree had no `node_modules`). Backend lint 0 issues, Go tests with `-race`, 773 frontend tests, build |
| `make test-integration` | **not run**: the diff touches no code that has integration tests (no mailer, no e2e). The task says none is needed, and none of the criteria below depend on one. Existing integration tests: the mailer's, against Mailpit |
| `go test -race -count=200 -run 'TestRestart\|TestStop_\|TestClose_\|TestStart_' ./internal/worker` | passed, 71 s, no flake |
| `go test -race ./internal/worker`, three times | passed 3/3 |
| `go test -race -count=100 -run 'TestUpdateService\|TestGetService' ./internal/usecase` | passed |
| Live run: the built binary on `127.0.0.1:18931`, own SQLite file | see "Live run" |

## Criteria

"Real?" = would the test fail if the behaviour were removed. "yes (Mn)" means I broke the code and watched it fail (see Mutation checks); "yes (read)" means judged by reading only.

### Scheduler (`worker/scheduler_test.go`)

| Criterion | Test | Real? | Status |
|---|---|---|---|
| Restart, future time: none at once, none at wait−1 s, one at wait, recorded time = `firstCheckAt`, next one interval after it | `TestRestart_FirstSequenceRunsAtFirstCheckAt` | yes (W1: timer 1 s early fails). The "next counts from `firstCheckAt`" half could **not** be shown: W2 survived because the fake clock lands exactly on `firstCheckAt`. Closed by the subtest I added (below) | met |
| Restart, time not after now (equal, past, far back): at once, no timer, no burst | `TestRestart_TimeNotAfterNowRunsAtOnce` | yes (W3) | met |
| Restart while the old sequence is held: returns at once, old ctx cancelled, new runs nothing until release, `maxRunning` 1, new interval | `TestRestart_DoesNotWaitAndDoesNotOverlapTheOldSequence` | yes (M7, W4) | met |
| Two Restarts while held: only the later runs | `TestRestart_ChainRunsOnlyTheLast` | yes (M9) | met |
| Restart then Start while held | `TestStart_AfterRestartWaitsForTheChain` | yes (M9) | met |
| Restart while a Start waits: returns at once, one goroutine, Close ends all | `TestRestart_WhileStartWaits` | yes (M8) | met |
| Restart for an id on a timer: old timer stopped | `TestRestart_ReplacesWaitingTimer` | yes (read) | met |
| Restart for an unknown id starts it | `TestRestart_UnknownIDStartsIt` | yes (read) | met |
| Stop during the first wait of a restarted service | `TestRestart_StopDuringFirstWait` | yes (read) | met |
| Stop then Start, Stop then Restart: no overlap | `TestStop_ThenStartWaitsForTheStoppedGoroutine`, `TestStop_ThenRestartWaitsForTheStoppedGoroutine` | yes (M1: failed 3 of 3 runs, always through a package timeout, see finding 1) | met |
| After Stop and the goroutine's end, nothing remains | `TestStop_LeavesNoBookkeepingAfterTheGoroutineEnds` | yes (M10) | met |
| Close waits for a stopped goroutine | `TestClose_WaitsForAStoppedGoroutine` | yes (M1 variant, read) | met |
| Close while a restarted goroutine waits; Close while a Start waits for a stopped goroutine | `TestClose_WhileRestartWaits`, `TestClose_WhileStartWaitsForAStoppedGoroutine` | yes (read; M9 run included `TestClose_WhileRestart`) | met |
| Restart with interval 0 and −1: nothing runs, one error log, running entry untouched | `TestRestart_InvalidInterval` | yes (read) | met |
| Two Restarts from two goroutines under `-race`, then Close | `TestRestart_FromManyGoroutines` | statistical, as the task says; 200 runs clean | met |
| Existing scheduler tests unchanged in meaning | whole file | n/a | met (`git diff` shows only additions to the file) |

### Repository (`repository/service_test.go`; a real SQLite file, as `TESTING.md` requires)

| Criterion | Test | Real? | Status |
|---|---|---|---|
| `Get` equals `List`'s item, UTC, unknown id `ErrNotFound` | `TestServiceGet_ReturnsTheViewEqualToTheListed`, `TestServiceGet_UnknownIDIsNotFound` | yes (R1) | met |
| `Update` HTTP, every field, `Get` returns the same | `TestServiceUpdate_ReplacesEveryFieldOfAnHTTPService` | yes (M4b, R2) | met (FR-7) |
| HTTP to TCP and TCP to HTTP clear the other type's columns | `TestServiceUpdate_TypeChangeClearsTheOtherTypesColumns` | yes (M4b) | met (FR-7, FR-33) |
| false/empty values written | `TestServiceUpdate_WritesFalseAndEmptyValues` | yes (M4b) | met |
| Keeps id, `created_at`, `paused`, the state across an HTTP→TCP edit; sets `updated_at` | `TestServiceUpdate_KeepsIdentityPausedAndState` | yes (M3: writing `paused` fails; R2: skipping `updated_at` fails) | met (FR-66) |
| Name clash ignoring case is `ErrServiceNameTaken`, row unchanged; own name in other case saved; unknown id `ErrNotFound` | `TestServiceUpdate_NameRules` | clash and not-found: yes (read, and live run). The `id <> ?` in the clash count is an equivalent mutant (R3 survived): a duplicate-key error can only come from another row | met (FR-59) |

### Usecase (`usecase/service_test.go`)

| Criterion | Test | Real? | Status |
|---|---|---|---|
| `GetService` returns the whole view | `TestGetService_ReturnsTheViewOfTheService` | yes (read) | met |
| Full body gives the literal expected row with the path id; one test per group (name and flags, HTTP request, rules and certificate, timings, TCP, type change both ways) | `TestUpdateService_SavesEverythingGiven`, `TestUpdateService_GroupsOfSettings` | yes (M4a: fails in the HTTP→TCP and TCP subtests) | met |
| Trimmed values, key from the trimmed name | `TestUpdateService_SavesTrimmedValues` | yes (read) | met |
| Rejected input: `ValidationError`, no `Update`, no scheduler, id existing or not; 500 passes, 501 rejected | `TestUpdateService_RejectedInputSavesNothing` | yes (M12: write before validation fails) | met (FR-12, FR-74, FR-65) |
| Defaults on replace | `TestUpdateService_OmittedValuesTakeTheDefaults` | yes (read) | met |
| Repository errors returned, scheduler not called | `TestUpdateService_FailedWriteDoesNotTouchTheScheduler` | yes (read) | met |
| Unpaused: `update` then one `restart`, never `Start` | `TestUpdateService_RestartsTheScheduleOnceAfterTheWrite` | yes (M2) | met |
| Paused: write, no scheduler call | `TestUpdateService_PausedServiceIsNotScheduled` | yes (M2b) | met |
| Next-check time: none, one second before the boundary, equal, before, new interval, future | `TestUpdateService_NextCheckTime` | yes (M5, M5b: the boundary row fails) | met (FR-66) |
| No check at saving | same test, plus M2 | yes | met |
| 50 rounds of two concurrent edits alternate | `TestUpdateService_ConcurrentEditsAreSerialized` | yes (M6) | met |
| 50 rounds of edit and delete | `TestUpdateService_AndDeleteAreSerialized` | yes (M6, M11) | met |

### Handler (`handler/services_test.go`, `router_test.go`)

| Criterion | Test | Real? | Status |
|---|---|---|---|
| `getService` 200 (HTTP with full header values, TCP) through `AssertConforms`; 404; 500 text hidden; 401 not reaching the spy | `TestGetService_Answers200WithTheSameMappingAsListAndCreate`, `_NotFoundIs404`, `_UnexpectedErrorHidesItsText`, `_WithoutASessionIs401AndNeverReachesTheSpy` | yes (read; the live run returned the header value in full, FR-39) | met |
| `updateService` 200, spy sees the mapped input and path id; 404, 409, 422 every field, 500 hidden; one log line with id and name | `TestUpdateService_Answers200WithTheSavedServiceAndPassesTheInput`, `_ErrorsMapToTheirCodes`, `_LogsOneLineWithTheIDAndNameOnly` | yes (H1: wrong id fails; H2: logging a field of the body fails) | met |
| Gate failures never reach the spy: 401, 403, 413, 415, 400 | `TestUpdateService_GateFailuresNeverReachTheSpy` | yes (H1 also fails its size-limit row) | met |
| NFR-8: both operations sit behind the gate and the CSRF check | existing `TestRouter_Gate`, `TestRouter_CSRF`, which walk every operation in the contract | yes (read: a new gated operation without the check fails them) | met |
| 501 test rewritten to `GET /api/public/dashboard` | `TestRouter_UnimplementedOperationAnswers501` | yes | met |

### Repo-wide

| Criterion | Status |
|---|---|
| `make check` passes | met |
| Nothing outside the allowed paths changed | met: from the merge base b5cc673 the diff is only `handler/`, `repository/`, `usecase/`, `worker/scheduler*` and the plan file. `go.mod`, `go.sum`, `docs/openapi.yaml`, `.env.example`, `Makefile`, `domain/`, `main.go` and `migration/` are unchanged |

## Plan check

- Every criterion in the task file has a plan item. None is missing.
- Every ticked item has a test that exists and checks the behaviour (confirmed per row above).
- Differences between the plan and the diff, all cosmetic: three test names differ from the diff (`TestGetService_ReturnsTheView` is `…ReturnsTheViewOfTheService`; `TestUpdateService_Group*` is `TestUpdateService_GroupsOfSettings`; `…GateFailuresNeverReachTheUsecase` is `…ReachTheSpy`). The plan says "merged `origin/main` at b5cc673"; `main` has moved since (see finding 4).
- Judgment call worth a look: the edit-and-delete test expects the events `delete, stop, update`: the fake repository records an `update` event for the call that returned `ErrNotFound`. The task says such an update "called nothing". The test still asserts no `restart` after the `stop`, and M11 shows it fails when the delete skips the mutex. I judge the criterion met.

## Rule checks

| Rule | Result |
|---|---|
| Dependencies (ROLES.md, STACK.md) | none added, `go.mod` and `go.sum` untouched, no pinned version changed |
| One function builds the row for create and update | yes: `buildService(in, id, now)`, no copy |
| No `Start` in `UpdateService`; no `Restart` for a paused service | yes (M2, M2b) |
| `scheduler.go` does not read `Paused` | yes: it appears only in doc comments |
| `Update` has an explicit column list without `paused`, `created_at`, `id`, state | yes (`editableColumns`; M3) |
| `Get` and `List` share the query text | yes: `selectServicesSQL` plus the order or the id condition |
| Handler adds no status or rule the contract lacks; 409 only `service_name_taken` | yes; mapping is the existing `problem.go` |
| Log line has no URL, header or body | yes (H2) |
| Layer boundaries (CONVENTIONS.md) | handler → usecase interface, usecase → repository interface, worker imports only `domain`, `pkg/clock` and the standard library; test imports follow TESTING.md |
| Transactions | `Update` writes and reads back in one `Transaction` |
| Data scoping | single admin, no per-user scoping to check |
| Time | all worker and usecase tests use the fake clock, no `time.Sleep` |
| Test files | no `_edge` or `_regress` files; the one test I added is a subtest in the existing file |
| Frontend | not touched |

## Mutation checks run

All restored after each run (`git status` clean). "Fails" means the named tests failed.

| # | Break | Result |
|---|---|---|
| M1 | `Stop` deletes the entry at once | fails: `TestStop_ThenStartWaits…` and `…ThenRestart…`, 3 of 3 runs, always by hanging (finding 1) |
| M2 | usecase calls `Start` instead of `Restart` | fails: 9 tests (`RestartsTheScheduleOnce…`, every `NextCheckTime` row, both serialization tests) |
| M2b | `Restart` also for a paused service | fails: `PausedServiceIsNotScheduled` |
| M3 | `Update` writes `paused` | fails: `KeepsIdentityPausedAndState` |
| M4a | the TCP row keeps the HTTP values | fails: `GroupsOfSettings/HTTP_to_TCP`, `…/TCP_host_and_port`, and create's `SavesATCPServiceWithoutHTTPColumns` |
| M4b | `Update` skips the HTTP columns | fails: 4 repository tests |
| M5 | no not-after-now fallback | fails: `NextCheckTime` (boundary and "long ago") |
| M5b | `After` becomes `!Before` | fails: the boundary row only |
| M6 | edit mutex removed | both serialization tests fail on the first bad round; without `-race` and with it (18 data races reported). The tests use `require` in the round loop, so the number of failing rounds cannot be counted: the first one stops the test |
| M7 | `Restart` waits in the caller | fails `TestRestart_DoesNotWait…` through `returnsWithin`, then hangs (finding 1) |
| M8 | `Restart` takes `startMu` | fails `TestRestart_WhileStartWaits`, by timeout |
| M9 | `done` closed before the wait for the previous goroutine | fails `ChainRunsOnlyTheLast`, `DoesNotWait…`; `StartAfterRestart…` by timeout |
| M10 | cleanup of the stopped bookkeeping removed | fails `TestStop_LeavesNoBookkeeping…` |
| M11 | `DeleteService` skips the mutex | fails `AndDeleteAreSerialized`, 9 data races |
| M12 | validation after the write | fails `RejectedInputSavesNothing` |
| W1 | first timer one second early | fails `FirstSequenceRunsAtFirstCheckAt` |
| W2 | next check counted from now, not `firstCheckAt` | **survived** (finding 2); fails after the subtest I added |
| W3 | timer made even when `firstCheckAt` is not after now | fails `TimeNotAfterNowRunsAtOnce`, 3 rows |
| W4 | `Restart` does not cancel the old entry | fails by timeout |
| H1, H2 | handler passes a wrong id; handler logs a field | fail |
| R1, R2 | `Get` always not-found; `Update` skips `updated_at` | fail |
| R3 | clash count without `id <> ?` | survived: equivalent mutant |

## Live run

Built `./cmd/server`, started it on `127.0.0.1:18931` with its own database file, signed in, and created an HTTP service with a header and a TCP service. All were as expected:

- `PUT` with `id`, `paused: true`, `state` and `target_count` in the body: 200; the id, `paused` (false) and state kept, the body fields ignored. A change to TCP, `ALPHA` (same name, other case) and the flags were saved.
- Clash: `alpha` and `"  Alpha  "` on the other service gave 409 `service_name_taken`; `" BETA "` (its own name) gave 200.
- Unknown id: valid body 404; empty name 422 (validation first); `a%20b` and a 5000-character id 404 on both `PUT` and `GET`.
- Limits: name 100 passed and 101 gave 422; messages 500 passed and 501 gave 422; 20 headers with 10 JSON rules passed, 21 headers and 11 rules gave 422 `too_many`.
- Gates: no CSRF token 403, `text/plain` 415, malformed body 400, empty body 400, `GET` without a session 401.
- 20 simultaneous `PUT`s of one service, alternating HTTP and TCP: all 200, no error or panic in the log, and the stored service equals the last `service updated` log line.
- `PUT` after `DELETE`: 404. The app's own process was stopped afterwards.

Not tried live: an edit of a paused service (`pauseService` does not exist yet; the usecase test covers it) and the timing of the next check (a unit test covers it; an hour-long interval cannot be watched).

## Findings

### Blocking

None.

### Non-blocking

1. **Test quality: a scheduler regression hangs the package instead of failing it.** The overlap tests hold a sequence open and release it only after the assertions. When an assertion fails (`Fatal`), the cleanup `Close` waits for the held sequence forever, so `go test` ends with `panic: test timed out` after its default 10 minutes. Reproduced with M1, M7, M8, M9 and W4: the mutation is detected, but only as a timeout, which hides the failing assertion's message and every later test. Matters when: a future change breaks Restart or Stop ordering and CI shows a ten-minute timeout. Fix: close the release channel in a `t.Cleanup` registered before `Close`.
2. **Test quality (fixed here): the schedule counting from `firstCheckAt` was not tested.** Mutation W2 survived because every test advances the fake clock exactly to `firstCheckAt`. I added the subtest `TestRestart_FirstSequenceRunsAtFirstCheckAt/a late wake-up does not shift the schedule` (advance 55 s for a 50 s wait; the second check must come at `firstCheckAt` plus the interval). It fails under W2 and passes 30 runs under `-race`. This is a test change only.
3. **Test quality: the serialization tests cannot say how many rounds failed.** `require` in the loop stops at the first bad round. Matters when: someone wants to know how reliably a missing mutex shows up. Not urgent: it fails on every run I made (with and without `-race`).
4. **Decision needed: `main` has moved.** The branch is based on b5cc673; `origin/main` has the `tcp-probe` merge. `git merge-tree` reports a clean merge. Matters when: the user merges; run `make check` on the merged result if the order matters, because the task file's Known gap about a TCP edit not being checked (until `tcp-probe`) no longer holds after it.
5. **Cosmetic: the task file contradicts `TESTING.md`.** The task says "Repository tests use the in-memory database"; `TESTING.md` forbids it, and the builder correctly used a SQLite file. Plan test names differ slightly from the diff (see Plan check). Matters when: the next task is drafted from this file. Report only for the plan names.

## Docs or specs that no longer match

- `docs/openapi.yaml`: nothing out of date. `getService` and `updateService` were already described; the descriptions match the behaviour, and no change to the contract was needed.
- `docs/requirements.md`: nothing.
- `STACK.md`: no dependency was added or changed, so no version to record.
- The task file's Known gap "a service edited from HTTP to TCP is not checked until `tcp-probe` has merged" becomes false once `tcp-probe` is merged (it already is on `main`).
- The task file's "Repository tests use the in-memory database" (see finding 5); `TESTING.md` is right.
- `docs/tasks/backlog.md`, Milestone 3 table, row "FR-7, FR-39, FR-66 / Edit a service": the backend half is now built; the row's note ("Left out of `update-service-api`") should be updated by the drafter to name only the screen. The same applies to the rows for FR-27/FR-68 (the saved flag only), and to the Alerts group rows, which still wait on the frontend.
