# Plan: check sequence and state

Branch: `feat/check-sequence-and-state`.
R = `backend/internal/worker/check_runner_test.go`, U = `backend/internal/usecase/check_result_test.go`, D = `backend/internal/repository/service_state_test.go`.
Integration tests: none apply (no `integration`-tagged test in the touched code).

## Runner (`worker/check_runner.go`)

- [ ] Healthy first attempt: one record, one attempt, no timer, probe got method, URL, timeout — R `TestRun_HealthyFirstAttempt`
- [ ] RetryCount 2, all fail: three attempts, wait of the retry interval before each retry, one record; event order attempt, wait, attempt, wait, attempt, record — R `TestRun_AllAttemptsFail`
- [ ] Recorded code is the third attempt's — R `TestRun_RecordsLastFailure`
- [ ] Retry that succeeds ends the sequence — R `TestRun_RetrySucceeds`
- [ ] RetryCount 0 and failure: one attempt, no wait, one failed record — R `TestRun_NoRetries`
- [ ] Next attempt not started at interval less one second, started at the full interval — R `TestRun_WaitBoundary`
- [ ] Cancel during a wait: `context.Canceled`, timer stopped, nothing recorded — R `TestRun_CancelDuringWait`
- [ ] Cancel during an attempt: context error, nothing recorded — R `TestRun_CancelDuringAttempt`
- [ ] Cancel after final result before record: nothing recorded — R `TestRun_CancelBeforeRecord`
- [ ] Deadline gives `DeadlineExceeded`, nothing recorded — R `TestRun_DeadlineInsteadOfCancel`
- [ ] Context ended and timer fired: no second attempt, nothing recorded — R `TestRun_ContextWinsOverFiredTimer`
- [ ] Negative RetryCount: one attempt, no wait — R `TestRun_NegativeRetryCount`
- [ ] TCP service: nil, no probe, record or timer — R `TestRun_TCPService`
- [ ] HTTP service with nil URL / nil method: error, nothing probed or recorded — R `TestRun_HTTPServiceMissingMethodOrURL`
- [ ] Non-context prober error returned, nothing recorded — R `TestRun_ProberError`
- [ ] Recorder error returned unchanged, recorder called once — R `TestRun_RecorderError`
- [ ] Two sequences at once keep their own service ids, under `-race` — R `TestRun_ConcurrentSequences`

## Usecase (`usecase/check_result.go`)

- [ ] not_yet_checked + healthy — U `TestRecordCheckResult_Rule`
- [ ] not_yet_checked + failed — U `TestRecordCheckResult_Rule`
- [ ] healthy + healthy keeps change time — U `TestRecordCheckResult_Rule`
- [ ] healthy + failed — U `TestRecordCheckResult_Rule`
- [ ] unhealthy + healthy clears failure columns — U `TestRecordCheckResult_Rule`
- [ ] unhealthy + other failure keeps change time, drops old HTTP status — U `TestRecordCheckResult_Rule`
- [ ] 503 / `$.status` / stray HTTP status on timed_out (FR-61) — U `TestRecordCheckResult_FailureColumns`
- [ ] non_2xx_status with no status saves null — U `TestRecordCheckResult_FailureColumns`
- [ ] Invalid result (healthy with Failure, unhealthy without): error, state unchanged — U `TestRecordCheckResult_RejectsInconsistentResult`
- [ ] ErrNotFound returns nil and changes nothing; other error returned (FR-70) — U `TestRecordCheckResult_DeletedService`, `TestRecordCheckResult_RepositoryError`
- [ ] Time comes from the clock — U `TestRecordCheckResult_TimeFromClock`

## Repository (`repository/service_state.go`)

- [ ] Update writes every column, UTC (FR-61) — D `TestServiceStateUpdate_WritesEveryColumn`
- [ ] Recovery nulls the three failure columns (FR-55) — D `TestServiceStateUpdate_ClearsFailureColumns`
- [ ] apply sees the row as in the database, also after an earlier Update — D `TestServiceStateUpdate_ApplySeesStoredRow`
- [ ] Missing id: ErrNotFound, apply not called, no row created — D `TestServiceStateUpdate_MissingRow`
- [ ] Cascade delete then Update: ErrNotFound, no row — D `TestServiceStateUpdate_AfterServiceDeleted`
- [ ] Zero state refused by constraint, row unchanged — D `TestServiceStateUpdate_ZeroStateRefused`
- [ ] Changed ServiceID does not move or create a row — D `TestServiceStateUpdate_KeepsServiceID`
- [ ] Healthy with failure code refused, row unchanged — D `TestServiceStateUpdate_ConstraintRefused`
- [ ] Survives close and reopen (NFR-1) — D `TestServiceStateUpdate_SurvivesReopen`

## Repo-wide

- [ ] `make check` passes: not run yet
- [ ] `git diff go.mod go.sum` empty
- [ ] Nothing outside allowed paths changed
- [ ] Integration tests (`make test-integration`): not run: no integration-tagged test in the touched code and the task says none is needed

## Judgment calls

(to fill)
