# Plan: update-service API

Branch: `feat/update-service-api` (merged `origin/main` at b5cc673 first; task file re-read after it).
Prerequisite checked: `TestStart_ReplacesRunningService` reads the second sequence's totals inside the sequence. Met.

Files: S = `backend/internal/worker/scheduler_test.go`, R = `backend/internal/repository/service_test.go`, U = `backend/internal/usecase/service_test.go`, H = `backend/internal/handler/services_test.go`, RT = `backend/internal/handler/router_test.go`.

## Scheduler (code: `worker/scheduler.go`; tests in S)

- [x] Restart, future time: none at once, none at wait-1s, one at wait, time == firstCheckAt, next one interval later. S `TestRestart_FirstSequenceRunsAtFirstCheckAt`
- [x] Restart, time not after now (equal, past, far past): runs at once, no timer, no burst. S `TestRestart_TimeNotAfterNowRunsAtOnce`
- [x] Restart while old sequence held: returns at once, old ctx cancelled, new runs nothing until release, maxRunning 1, new interval. S `TestRestart_DoesNotWaitAndDoesNotOverlapTheOldSequence`
- [x] Two Restarts in a row while held: only the later runs, maxRunning 1. S `TestRestart_ChainRunsOnlyTheLast`
- [x] Restart then Start while held: Start returns after both ended, maxRunning 1, new sequence at once. S `TestStart_AfterRestartWaitsForTheChain`
- [x] Restart while a Start waits: Restart returns at once, one goroutine runs, Close ends all. S `TestRestart_WhileStartWaits`
- [x] Restart for an id on a timer: old timer stopped, only new fires. S `TestRestart_ReplacesWaitingTimer`
- [x] Restart for an unknown id starts it. S `TestRestart_UnknownIDStartsIt`
- [x] Stop during the wait of a restarted service: nothing runs, timer stopped. S `TestRestart_StopDuringFirstWait`
- [x] Stop then Start / Stop then Restart, same id: no overlap. S `TestStop_ThenStartWaitsForTheStoppedGoroutine`, `TestStop_ThenRestartWaitsForTheStoppedGoroutine`
- [x] After Stop and the goroutine's end, no entry remains. S `TestStop_LeavesNoBookkeepingAfterTheGoroutineEnds`
- [x] Close returns only after a stopped goroutine ended. S `TestClose_WaitsForAStoppedGoroutine`
- [x] Close while a restarted goroutine waits (released after closed is set), and Close while a Start waits for a stopped goroutine. S `TestClose_WhileRestartWaits`, `TestClose_WhileStartWaitsForAStoppedGoroutine`
- [x] Restart with interval 0 and -1: nothing runs, one error log, running entry untouched. S `TestRestart_InvalidInterval`
- [x] Two Restarts from two goroutines under -race, then Close. S `TestRestart_FromManyGoroutines`
- [x] Existing scheduler tests pass unchanged in meaning. S (whole file)
- [x] Comments: `startMu`, `mu`, `Paused` in `Start`/`Restart`/`usecase.Scheduler`.

## Repository (code: `repository/service.go`; tests in R)

- [x] `Get`: state, target_count, alert_delivery_failed, equal to List, UTC; unknown id is ErrNotFound. R `TestServiceGet_ReturnsTheViewEqualToTheListed`, `TestServiceGet_UnknownIDIsNotFound`
- [x] `Update` HTTP, every field set; `Get` returns the same. R `TestServiceUpdate_ReplacesEveryFieldOfAnHTTPService`
- [x] `Update` HTTP to TCP and TCP to HTTP clears the other type's columns. R `TestServiceUpdate_TypeChangeClearsTheOtherTypesColumns`
- [x] `Update` writes false/empty values. R `TestServiceUpdate_WritesFalseAndEmptyValues`
- [x] `Update` keeps id, created_at, paused, state (across HTTP to TCP), sets updated_at. R `TestServiceUpdate_KeepsIdentityPausedAndState`
- [x] Name clash ignoring case is ErrServiceNameTaken and row unchanged; own name in another case saved; unknown id ErrNotFound. R `TestServiceUpdate_NameRules`

## Usecase (code: `usecase/service.go`, `service_repository.go`; tests in U, fakes in `fakes_test.go`)

- [x] `GetService` returns the whole view for an existing service. U `TestGetService_ReturnsTheView`
- [x] `UpdateService` full body gives the literal expected row with the path id, view returned; one test per group (name and flags, HTTP request, JSON rules and certificate, timings, TCP host and port, type change both ways). U `TestUpdateService_SavesEverythingGiven`, `TestUpdateService_Group*`
- [x] Normalization: trimmed values, key from trimmed name. U `TestUpdateService_SavesTrimmedValues`
- [x] Rejected input: ValidationError, no Update, no scheduler, id existing or not (500-char message passes, 501 rejected, non-default limits). U `TestUpdateService_RejectedInputSavesNothing`
- [x] Defaults on replace. U `TestUpdateService_OmittedValuesTakeTheDefaults`
- [x] Repository errors returned, scheduler not called. U `TestUpdateService_FailedWriteDoesNotTouchTheScheduler`
- [x] Unpaused: `update` then `restart` once, never Start. U `TestUpdateService_RestartsTheScheduleOnceAfterTheWrite`
- [x] Paused: write, no scheduler call. U `TestUpdateService_PausedServiceIsNotScheduled`
- [x] Next-check time (no last check; one second before the boundary; exactly equal; before now; new interval; future last check). U `TestUpdateService_NextCheckTime`
- [x] No check at saving: never `Start`, time after now in every case. U covered by `TestUpdateService_NextCheckTime`
- [x] Edits serialized: 50 rounds of two concurrent edits, `update, restart` alternate. U `TestUpdateService_ConcurrentEditsAreSerialized`
- [x] Edit and delete serialized: 50 rounds, no restart after stop. U `TestUpdateService_AndDeleteAreSerialized`
- [x] Shared builder: create and update use one function. `usecase/service.go`; existing `TestCreateService_*` still pass.

## Handler (code: `handler/services.go`, `server.go`; tests in H, RT)

- [x] `getService` 200 (HTTP with full header values, TCP) through `AssertConforms`; 404; 500 text hidden; 401 not reaching the spy. H `TestGetService_*`
- [x] `updateService` 200 (spy sees mapped input and path id, `AssertConforms`); 404, 409, 422, 500; one `service updated` log line with only id and name. H `TestUpdateService_*`
- [x] Gate failures (401, 403, 413, 415, 400) never reach the spy. H `TestUpdateService_GateFailuresNeverReachTheUsecase`
- [x] `TestRouter_UnimplementedOperationAnswers501` rewritten to `GET /api/public/dashboard`. RT; gate test lists both operations.

## Repo-wide

- [x] `make check` passes. Outcome: run, passed (exit 0; ran `npm ci` in `frontend/` first, the worktree had no `node_modules`)
- [x] Nothing outside the allowed paths changed (`git diff --stat origin/main`).
- [x] Integration tests: not run: no code with integration tests was touched (mailer and e2e are untouched; the task says none is needed)

## Judgment calls

- The handler tests send a `PUT` whose body carries `id`, `paused` and `state`; they show the generated input type ignores them and the answer's `id` and `paused` come from the view.
- `TestUpdateService_*` for a rejected body compares the fields with what `CreateService` returns for the same body, instead of listing field codes again.
- Where the task says the edit and delete test must show "an update that ran after the delete returned `ErrNotFound`", the fake repository still records an `update` event for that rejected call, so the expected events are `delete, stop, update`.
- `TestRestart_WhileStartWaits` asserts the invariants only (one goroutine at a time, `Close` ends all), not whether `Start` or `Restart` wins, as the task's known gaps say.
- Overlap tests use a `runtime.Gosched()` loop of 1000 turns and a `firstCheckAt` that is not after now, as the task asks; `holdFirst` makes later sequences return at once, except in the Start-waits test where the survivor blocks on its context.
- The "unknown id starts it" scheduler item has its own small test next to the future-time one, since both share the timer setup.
- Gate and CSRF coverage for the two operations comes from the existing generic router tests (`TestRouter_Gate`, `TestRouter_CSRF`), which walk every operation in the contract; I added only the per-operation gate failures for `updateService`.
- Repository `Update` finds a name clash with `name_key = ? AND id <> ?` after a duplicate-key error, so the own row never counts as a clash.
- Mutation check done by me: removing the edit mutex made both serialization tests fail (23 data races reported by `-race`). The other mutations are left to the verifier.
