# Plan: check sequence and state

Branch: `feat/check-sequence-and-state`.
R = `backend/internal/worker/check_runner_test.go`, U = `backend/internal/usecase/check_result_test.go`, D = `backend/internal/repository/service_state_test.go`.
Integration tests: none apply (no `integration`-tagged test in the touched code).

## Runner (`worker/check_runner.go`)

- [x] Healthy first attempt: one record, one attempt, no timer, probe got method, URL, timeout — R `TestRun_HealthyFirstAttempt`
- [x] RetryCount 2, all fail: three attempts, wait of the retry interval before each retry, one record; event order attempt, wait, attempt, wait, attempt, record — R `TestRun_AllAttemptsFail`
- [x] Recorded code is the third attempt's — R `TestRun_RecordsLastFailure`
- [x] Retry that succeeds ends the sequence — R `TestRun_RetrySucceeds`
- [x] RetryCount 0 and failure: one attempt, no wait, one failed record — R `TestRun_NoRetries`
- [x] Next attempt not started at interval less one second, started at the full interval — R `TestRun_WaitBoundary`
- [x] Cancel during a wait: `context.Canceled`, timer stopped, nothing recorded — R `TestRun_CancelDuringWait`
- [x] Cancel during an attempt: context error, nothing recorded — R `TestRun_CancelDuringAttempt`
- [x] Cancel after final result before record: nothing recorded — R `TestRun_CancelBeforeRecord`
- [x] Deadline gives `DeadlineExceeded`, nothing recorded — R `TestRun_DeadlineInsteadOfCancel`
- [x] Context ended and timer fired: no second attempt, nothing recorded — R `TestRun_ContextWinsOverFiredTimer`
- [x] Negative RetryCount: one attempt, no wait — R `TestRun_NegativeRetryCount`
- [x] TCP service: nil, no probe, record or timer — R `TestRun_TCPService`
- [x] HTTP service with nil URL / nil method: error, nothing probed or recorded — R `TestRun_HTTPServiceMissingMethodOrURL`
- [x] Non-context prober error returned, nothing recorded — R `TestRun_ProberError`
- [x] Recorder error returned unchanged, recorder called once — R `TestRun_RecorderError`
- [x] Two sequences at once keep their own service ids, under `-race` — R `TestRun_ConcurrentSequences`

## Usecase (`usecase/check_result.go`)

- [x] not_yet_checked + healthy — U `TestRecordCheckResult_Rule`
- [x] not_yet_checked + failed — U `TestRecordCheckResult_Rule`
- [x] healthy + healthy keeps change time — U `TestRecordCheckResult_Rule`
- [x] healthy + failed — U `TestRecordCheckResult_Rule`
- [x] unhealthy + healthy clears failure columns — U `TestRecordCheckResult_Rule`
- [x] unhealthy + other failure keeps change time, drops old HTTP status — U `TestRecordCheckResult_Rule`
- [x] 503 / `$.status` / stray HTTP status on timed_out (FR-61) — U `TestRecordCheckResult_FailureColumns`
- [x] non_2xx_status with no status saves null — U `TestRecordCheckResult_FailureColumns`
- [x] Invalid result (healthy with Failure, unhealthy without): error, state unchanged — U `TestRecordCheckResult_RejectsInconsistentResult`
- [x] ErrNotFound returns nil and changes nothing; other error returned (FR-70) — U `TestRecordCheckResult_DeletedService`, `TestRecordCheckResult_RepositoryError`
- [x] Time comes from the clock — U `TestRecordCheckResult_TimeFromClock`

## Repository (`repository/service_state.go`)

- [x] Update writes every column, UTC (FR-61) — D `TestServiceStateUpdate_WritesEveryColumn`
- [x] Recovery nulls the three failure columns (FR-55) — D `TestServiceStateUpdate_ClearsFailureColumns`
- [x] apply sees the row as in the database, also after an earlier Update — D `TestServiceStateUpdate_ApplySeesStoredRow`
- [x] Missing id: ErrNotFound, apply not called, no row created — D `TestServiceStateUpdate_MissingRow`
- [x] Cascade delete then Update: ErrNotFound, no row — D `TestServiceStateUpdate_AfterServiceDeleted`
- [x] Zero state refused by constraint, row unchanged — D `TestServiceStateUpdate_ZeroStateRefused`
- [x] Changed ServiceID does not move or create a row — D `TestServiceStateUpdate_KeepsServiceID`
- [x] Healthy with failure code refused, row unchanged — D `TestServiceStateUpdate_ConstraintRefused`
- [x] Survives close and reopen (NFR-1) — D `TestServiceStateUpdate_SurvivesReopen`

## Repo-wide

- [x] `make check` passes: run, passed (exit 0; frontend deps installed with `npm ci` first)
- [x] `git diff go.mod go.sum` empty
- [x] Nothing outside allowed paths changed
- [x] Integration tests (`make test-integration`): not run: no integration-tagged test exists in the touched code, and the task says none is needed

## Judgment calls

- `Run` skips any service whose `CheckType` is not HTTP (the task names only TCP; the database allows only those two).
- Method on the runner is `Run(ctx, service)`; constructors are `NewCheckRunner`, `NewCheckResultService` and `NewServiceStateRepository`. The clock import path is `monitory/pkg/clock`.
- When the prober returns an error and the context has ended, `Run` returns `ctx.Err()`; otherwise the prober's error as given.
- The context is also checked after each wait, so a cancelled sequence never makes another attempt.
- The repository converts times to UTC on write as well as on read, so the stored value is UTC whatever zone `apply` returns.
- The usecase also drops a stray rule field on `non_2xx_status` (and a stray HTTP status on `json_rule_matched`), reading "set only for" literally.
- Extra tests beyond the criteria: a status sequence unhealthy, unhealthy, healthy, healthy (`TestRecordCheckResult_UnhealthyHealthyUnhealthySequence`) and a deadline during an attempt (`TestRun_DeadlineDuringAttempt`; the latter uses a real 20 ms context deadline, as `TESTING.md` allows for adaptors only, so the verifier may want it removed).
- Mutation checks I ran: removing the `ctx.Err()` before the record fails `TestRun_CancelBeforeRecord` and `TestRun_DeadlineInsteadOfCancel`; replacing the column selection in the update fails `TestServiceStateUpdate_ClearsFailureColumns` and `TestServiceStateUpdate_ZeroStateRefused`. The other mutations in the task file I did not run.
