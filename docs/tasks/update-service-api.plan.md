# Plan: update-service API

Branch: `feat/update-service-api` (merged `origin/main` at b5cc673 first; task file re-read after it).
Prerequisite checked: `TestStart_ReplacesRunningService` reads the second sequence's totals inside the sequence. Met.

Files: S = `backend/internal/worker/scheduler_test.go`, R = `backend/internal/repository/service_test.go`, U = `backend/internal/usecase/service_test.go`, H = `backend/internal/handler/services_test.go`, RT = `backend/internal/handler/router_test.go`.

## Scheduler (code: `worker/scheduler.go`; tests in S)

- [ ] Restart, future time: none at once, none at wait-1s, one at wait, time == firstCheckAt, next one interval later. S `TestRestart_FirstSequenceRunsAtFirstCheckAt`
- [ ] Restart, time not after now (equal, past, far past): runs at once, no timer, no burst. S `TestRestart_TimeNotAfterNowRunsAtOnce`
- [ ] Restart while old sequence held: returns at once, old ctx cancelled, new runs nothing until release, maxRunning 1, new interval. S `TestRestart_DoesNotWaitAndDoesNotOverlapTheOldSequence`
- [ ] Two Restarts in a row while held: only the later runs, maxRunning 1. S `TestRestart_ChainRunsOnlyTheLast`
- [ ] Restart then Start while held: Start returns after both ended, maxRunning 1, new sequence at once. S `TestStart_AfterRestartWaitsForTheChain`
- [ ] Restart while a Start waits: Restart returns at once, one goroutine runs, Close ends all. S `TestRestart_WhileStartWaits`
- [ ] Restart for an id on a timer: old timer stopped, only new fires. S `TestRestart_ReplacesWaitingTimer`
- [ ] Restart for an unknown id starts it. S `TestRestart_UnknownIDStartsIt`
- [ ] Stop during the wait of a restarted service: nothing runs, timer stopped. S `TestRestart_StopDuringFirstWait`
- [ ] Stop then Start / Stop then Restart, same id: no overlap. S `TestStop_ThenStartWaitsForTheStoppedGoroutine`, `TestStop_ThenRestartWaitsForTheStoppedGoroutine`
- [ ] After Stop and the goroutine's end, no entry remains. S `TestStop_LeavesNoBookkeepingAfterTheGoroutineEnds`
- [ ] Close returns only after a stopped goroutine ended. S `TestClose_WaitsForAStoppedGoroutine`
- [ ] Close while a restarted goroutine waits (released after closed is set), and Close while a Start waits for a stopped goroutine. S `TestClose_WhileRestartWaits`, `TestClose_WhileStartWaitsForAStoppedGoroutine`
- [ ] Restart with interval 0 and -1: nothing runs, one error log, running entry untouched. S `TestRestart_InvalidInterval`
- [ ] Two Restarts from two goroutines under -race, then Close. S `TestRestart_FromManyGoroutines`
- [ ] Existing scheduler tests pass unchanged in meaning. S (whole file)
- [ ] Comments: `startMu`, `mu`, `Paused` in `Start`/`Restart`/`usecase.Scheduler`.

## Repository (code: `repository/service.go`; tests in R)

- [ ] `Get`: state, target_count, alert_delivery_failed, equal to List, UTC; unknown id is ErrNotFound. R `TestServiceGet_ReturnsTheViewEqualToTheListed`, `TestServiceGet_UnknownIDIsNotFound`
- [ ] `Update` HTTP, every field set; `Get` returns the same. R `TestServiceUpdate_ReplacesEveryFieldOfAnHTTPService`
- [ ] `Update` HTTP to TCP and TCP to HTTP clears the other type's columns. R `TestServiceUpdate_TypeChangeClearsTheOtherTypesColumns`
- [ ] `Update` writes false/empty values. R `TestServiceUpdate_WritesFalseAndEmptyValues`
- [ ] `Update` keeps id, created_at, paused, state (across HTTP to TCP), sets updated_at. R `TestServiceUpdate_KeepsIdentityPausedAndState`
- [ ] Name clash ignoring case is ErrServiceNameTaken and row unchanged; own name in another case saved; unknown id ErrNotFound. R `TestServiceUpdate_NameRules`

## Usecase (code: `usecase/service.go`, `service_repository.go`; tests in U, fakes in `fakes_test.go`)

- [ ] `GetService` returns the whole view for an existing service. U `TestGetService_ReturnsTheView`
- [ ] `UpdateService` full body gives the literal expected row with the path id, view returned; one test per group (name and flags, HTTP request, JSON rules and certificate, timings, TCP host and port, type change both ways). U `TestUpdateService_SavesEverythingGiven`, `TestUpdateService_Group*`
- [ ] Normalization: trimmed values, key from trimmed name. U `TestUpdateService_SavesTrimmedValues`
- [ ] Rejected input: ValidationError, no Update, no scheduler, id existing or not (500-char message passes, 501 rejected, non-default limits). U `TestUpdateService_RejectedInputSavesNothing`
- [ ] Defaults on replace. U `TestUpdateService_OmittedValuesTakeTheDefaults`
- [ ] Repository errors returned, scheduler not called. U `TestUpdateService_FailedWriteDoesNotTouchTheScheduler`
- [ ] Unpaused: `update` then `restart` once, never Start. U `TestUpdateService_RestartsTheScheduleOnceAfterTheWrite`
- [ ] Paused: write, no scheduler call. U `TestUpdateService_PausedServiceIsNotScheduled`
- [ ] Next-check time (no last check; one second before the boundary; exactly equal; before now; new interval; future last check). U `TestUpdateService_NextCheckTime`
- [ ] No check at saving: never `Start`, time after now in every case. U covered inside the two tests above plus `TestUpdateService_NextCheckTime`
- [ ] Edits serialized: 50 rounds of two concurrent edits, `update, restart` alternate. U `TestUpdateService_ConcurrentEditsAreSerialized`
- [ ] Edit and delete serialized: 50 rounds, no restart after stop. U `TestUpdateService_AndDeleteAreSerialized`
- [ ] Shared builder: create and update use one function. `usecase/service.go`; existing `TestCreateService_*` still pass.

## Handler (code: `handler/services.go`, `server.go`; tests in H, RT)

- [ ] `getService` 200 (HTTP with full header values, TCP) through `AssertConforms`; 404; 500 text hidden; 401 not reaching the spy. H `TestGetService_*`
- [ ] `updateService` 200 (spy sees mapped input and path id, `AssertConforms`); 404, 409, 422, 500; one `service updated` log line with only id and name. H `TestUpdateService_*`
- [ ] Gate failures (401, 403, 413, 415, 400) never reach the spy. H `TestUpdateService_GateFailuresNeverReachTheUsecase`
- [ ] `TestRouter_UnimplementedOperationAnswers501` rewritten to `GET /api/public/dashboard`. RT; gate test lists both operations.

## Repo-wide

- [ ] `make check` passes. Outcome: (to fill)
- [ ] Nothing outside the allowed paths changed (`git diff --stat origin/main`).
- [ ] Integration tests: none touched. Outcome: (to fill)

## Judgment calls

(to fill at the end)
