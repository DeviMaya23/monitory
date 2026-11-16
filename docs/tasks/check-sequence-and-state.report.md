# Verification report: check sequence and state

Branch: `verify/check-sequence-and-state` (builder branch `feat/check-sequence-and-state`, HEAD `1842480`).

**Result: no Blocking findings.** `make check`: run, passed (frontend deps installed with `npm ci` first). Integration tests: not run, no test tagged `integration` exists anywhere in the repo, and the task needs none; no criterion depends only on one.

Test changes I made (tests only, no source): removed `TestRun_DeadlineDuringAttempt` (real 20 ms deadline, against TESTING.md "Time"); added `TestRun_MaxRetriesLongInterval` and `TestServiceStateUpdate_ConcurrentUpdatesDoNotLoseWrites`.

## Acceptance criteria

R = `worker/check_runner_test.go`, U = `usecase/check_result_test.go`, D = `repository/service_state_test.go`.

| Criterion | Test | Real? | Status |
|---|---|---|---|
| Healthy first attempt: 1 attempt, 1 record, no timer, method/URL/timeout passed (FR-54) | R `TestRun_HealthyFirstAttempt` | Yes (non-default 7 s timeout, interval 13) | Met |
| 3 attempts fail: wait before each retry, event order, 1 record (FR-51, FR-53, FR-54) | R `TestRun_AllAttemptsFail` | Yes: wait-minus-1s mutation fails it | Met |
| Recorded code is the third's (FR-54) | R `TestRun_RecordsLastFailure` | Yes: mutation fails it | Met |
| Retry succeeds ends sequence (FR-54) | R `TestRun_RetrySucceeds` | Yes | Met |
| RetryCount 0: one attempt, no wait (FR-51) | R `TestRun_NoRetries` | Yes (a healthy second step is scripted; a retry would change the log) | Met |
| Interval less 1 s does not start next attempt; full does (FR-53) | R `TestRun_WaitBoundary` | Yes: mutation fails it | Met |
| Cancel during wait: Canceled, timer stopped, nothing recorded (FR-71) | R `TestRun_CancelDuringWait` | Yes: removing `Stop` fails it | Met |
| Cancel during attempt (FR-71) | R `TestRun_CancelDuringAttempt` | Yes (blocks on ctx; no record asserted) | Met |
| Cancel before record (FR-71) | R `TestRun_CancelBeforeRecord` | Yes: mutation fails it; has a live-context baseline | Met |
| Deadline gives DeadlineExceeded, nothing recorded | R `TestRun_DeadlineInsteadOfCancel` | Yes: same mutation fails it | Met |
| Ctx ended and timer fired: no second attempt | R `TestRun_ContextWinsOverFiredTimer` | Yes: dropping `ctx.Err()` after wait fails it | Met |
| Negative RetryCount: one attempt, no wait | R `TestRun_NegativeRetryCount` | Yes | Met |
| TCP service: nil, nothing | R `TestRun_TCPService` | Yes (baseline included) | Met |
| Nil URL / nil method: error, nothing | R `TestRun_HTTPServiceMissingMethodOrURL` | Yes | Met |
| Non-context prober error returned, nothing recorded | R `TestRun_ProberError` | Yes | Met |
| Recorder error returned unchanged, called once | R `TestRun_RecorderError` | Partly: it passes an error through; "not retried" is asserted by `Len == 1` | Met |
| Two sequences at once, own ids, `-race` | R `TestRun_ConcurrentSequences` | Yes: prober holds both calls in flight | Met |
| not_yet_checked + healthy / failed; healthy+healthy; healthy+failed; unhealthy+healthy; unhealthy + other failure (FR-54, FR-55) | U `TestRecordCheckResult_Rule` | Yes: keep-old-change-time mutation fails it | Met |
| 503 / `$.status` / stray status / no status (FR-61) | U `TestRecordCheckResult_FailureColumns` | Yes: removing the gating fails it | Met |
| Inconsistent result: error, state unchanged | U `TestRecordCheckResult_RejectsInconsistentResult` | Yes | Met |
| ErrNotFound returns nil; other error returned (FR-70) | U `TestRecordCheckResult_DeletedService`, `_RepositoryError` | Yes: removing the drop fails the first | Met |
| Time from the clock | U `TestRecordCheckResult_TimeFromClock` | Yes: `time.Now` mutation fails it | Met |
| Update writes every column, UTC (FR-61) | D `TestServiceStateUpdate_WritesEveryColumn` | Yes: dropping UTC on write fails it | Met |
| Recovery nulls the three columns (FR-55) | D `TestServiceStateUpdate_ClearsFailureColumns` | Yes: mutation fails it | Met |
| `apply` sees the stored row, also after an earlier Update | D `TestServiceStateUpdate_ApplySeesStoredRow` | Yes | Met |
| Missing id: ErrNotFound, `apply` not called, no row (FR-70) | D `TestServiceStateUpdate_MissingRow` | Yes: create-row mutation fails it | Met |
| Cascade then Update: ErrNotFound, no row (FR-70) | D `TestServiceStateUpdate_AfterServiceDeleted` | Yes: same mutation fails it | Met |
| Zero state refused, row unchanged | D `TestServiceStateUpdate_ZeroStateRefused` | Yes | Met |
| Changed ServiceID moves nothing | D `TestServiceStateUpdate_KeepsServiceID` | Yes | Met |
| Healthy with a failure code refused | D `TestServiceStateUpdate_ConstraintRefused` | Yes | Met |
| Survives reopen (NFR-1) | D `TestServiceStateUpdate_SurvivesReopen` | Yes (real file closed and reopened) | Met |
| `make check` passes | run | n/a | Met |
| `go.mod`/`go.sum` unchanged | `git diff` is empty | n/a | Met |
| Nothing outside allowed paths | changed files: the 7 allowed files plus the plan | n/a | Met |

## Plan check

- Every criterion has a plan item; none is missing. Every ticked item names a test that exists and checks the behavior.
- Difference between plan and diff: the plan lists `TestRun_DeadlineDuringAttempt`, which I removed (see Findings, fixed). The plan says only two mutations were run; I ran all of those in the task file.
- Judgment calls in the plan (skip any non-HTTP type, UTC on write, stray rule field dropped on `non_2xx_status`) are consistent with the task file.

## Rule checks

- **Layering** (read imports): `worker/check_runner.go` imports only `domain` and `pkg/clock`; `usecase/check_result.go` imports only `domain`; `repository/service_state.go` imports no `usecase`; no usecase test imports `repository` or `worker`.
- **Time**: no `time.Now`, `Sleep`, `After` or `NewTimer` in the three source files. The wait uses `clock.NewTimer`, and `defer timer.Stop()` covers every exit path.
- **No literal timing**: interval, count and timeout come from the service. Tests use 13, 9, 17, 3 and 7 s, and now 5 retries with 300 s.
- **Where the rule lives**: the status table is only in `usecase/applyCheckResult`; the runner never reads a status; the repository only reads, calls `apply` and writes.
- **Never inserts**: no insert or upsert path in `service_state.go`; a missing row is `ErrNotFound`.
- **Dependencies**: no `go.mod`/`go.sum` change, no new import beyond the allowed ones.
- **Transactions**: one `Transaction` with read then write. The database uses `_txlock=immediate`, so concurrent updates serialize (checked below).

## Mutation checks run (each reverted)

| Mutation | Failing tests |
|---|---|
| Wait is interval minus 1 s | `TestRun_AllAttemptsFail`, `_RetrySucceeds`, `_WaitBoundary` |
| Remove `ctx.Err()` before record | `TestRun_CancelBeforeRecord`, `_DeadlineInsteadOfCancel` |
| Record the first failure | `TestRun_RecordsLastFailure`, `_RetrySucceeds` |
| Keep old change time on a real change | `TestRecordCheckResult_Rule`, `_UnhealthyHealthyUnhealthySequence` |
| Stop selecting columns in the update (no clearing) | `TestServiceStateUpdate_ClearsFailureColumns`, `_ZeroStateRefused` |
| `Update` creates a missing row | `TestServiceStateUpdate_MissingRow`, `_AfterServiceDeleted` |
| Remove `timer.Stop()` | `TestRun_CancelDuringWait` |
| Remove `ctx.Err()` after the wait | `TestRun_CancelDuringWait`, `_ContextWinsOverFiredTimer` |
| Drop ErrNotFound to nil | `TestRecordCheckResult_DeletedService` |
| Remove the `non_2xx_status` gating | `TestRecordCheckResult_FailureColumns` |
| Remove UTC on write | `TestServiceStateUpdate_WritesEveryColumn` |
| `time.Now` instead of the clock | `TestRecordCheckResult_TimeFromClock` and two more |
| Hard-code `retries := 2` | Not a failure but a hang: see Non-blocking 1 |

## Other cases tried

- RetryCount 5 with 300 s: six attempts, five waits of exactly 300 s, one record (new test, passes).
- Cancel at each of the three points of step 7: covered by the existing tests.
- Unhealthy, unhealthy, healthy, healthy: covered by the existing sequence test.
- Result for a deleted service: covered.
- Twenty concurrent `Update` calls, each incrementing a stored counter: all 20 land (new test, passes under `-race`, `-count=3`).
- Two sequences at once: covered.

## Findings

### Blocking

None.

### Non-blocking

1. **Test quality, report only.** Runner tests that call `Run` directly (for example `TestRun_NoRetries`) have no timeout. A regression that adds a wait hangs until `go test`'s 10-minute limit instead of failing fast. (I saw this with the hard-coded `retries := 2` mutation.) Matters when: a later change to the retry loop breaks one of those tests and CI hangs.
2. **Test quality, fixed.** `TestRun_DeadlineDuringAttempt` waited on a real 20 ms deadline in a worker test, which TESTING.md "Time" forbids. I removed it; `TestRun_CancelDuringAttempt` covers the same path and `TestRun_DeadlineInsteadOfCancel` covers the deadline error.

## Docs or specs that no longer match

- `docs/tasks/backlog.md` rows for FR-10, FR-111 and NFR-6 (line 23) still read correctly: both pieces are built and neither is called. No change needed until the scheduler task merges.
- `docs/openapi.yaml`, `docs/requirements.md`, `STACK.md`: nothing out of date. No dependency or version was added or adopted.
