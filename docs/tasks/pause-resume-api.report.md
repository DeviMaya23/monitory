# Verification report: pause and resume API

Verifier branch: `verify/pause-resume-api` (the session's branch, reset to `origin/feat/pause-resume-api` at `d9e1185`; only this report is added, no test was added or changed).

**Verdict: no Blocking findings.** `make check` passed. Every acceptance criterion is met by a test that fails when its behavior is removed. Integration tests: not run (see below).

## `make check`

Run, passed (exit 0): golangci-lint (0 issues), ESLint, stylelint, shellcheck, OpenAPI lint, Go tests with `-race`, 910 frontend tests, builds. A fresh worktree needs `npm ci` in `frontend/` first; it changed no tracked file. `go test -race -count=3` on `usecase` and `repository`: passed.

## Acceptance criteria

"Real?" = would the test fail if the behavior were removed. "Yes (M)" means I removed it and watched it fail (see "Mutation checks run").

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| R1 | `SetPaused(true)` unpaused: changed, `Paused`, `updated_at` = given time (UTC), `Get` agrees, state and other columns unchanged (FR-75, FR-78) | `repository.TestServiceSetPaused_PausesAndResumesKeepingEverythingElse` | Yes. It compares the whole services row and the state fields | Met |
| R2 | Again: changed false, `updated_at` kept; resume changed true, state kept; again false | same test | Yes (M: `updated_at` written when unchanged) | Met |
| R3 | Unknown id: `ErrNotFound` for both values, nothing written | `TestServiceSetPaused_UnknownIDIsNotFoundAndWritesNothing` | Yes. The row and count are compared before and after | Met |
| R4 | State `Update` on a paused service: `ErrServicePaused`, `apply` not called, row unchanged; unpaused baseline writes | `TestServiceStateUpdate_PausedServiceIsRefusedAndNothingIsWritten` | Yes (M: paused read dropped) | Met |
| R5 | State `Update` with no service row: `ErrNotFound`; existing state tests unchanged | existing missing-id and deleted-service tests; existing tests untouched (diff only adds) | Partly: the new `services` read's not-found branch has no test of its own. A state row cannot exist without a service row (foreign key), so the old missing-state path gives the same answer. The behavior holds; the new branch is not pinned (Non-blocking N1) | Met |
| U1 | Pause: `SetPaused(true, clock time)` then one `Stop(id)`; events `set-paused`, `stop`; view and state as returned | `usecase.TestPauseService_SavesTheFlagThenStopsTheSchedulerOnce` | Yes (M: `Stop` removed) | Met |
| U1b | Stop is reached though the request was cancelled (task "Behavior" step 3) | `TestPauseService_StopsEvenWhenTheRequestIsCancelled` | Yes (M: `Stop` removed) | Met |
| U2 | Pause with `changed` false: no scheduler call | `TestPauseService_WhenTheFlagDidNotChangeNothingIsCalled` | Yes (M). Baseline: the write is asked, the scheduler is not | Met |
| U3 | Resume `changed`: one `Restart` with the returned service and `firstCheckAt` = clock time; no `Start`/`Stop` | `TestResumeService_RestartsOnceWithTheServiceAndTheClockTime` | Yes (M: `Start` instead of `Restart`) | Met |
| U4 | Resume `changed` false: no scheduler call | `TestResumeService_WhenTheServiceIsNotPausedNothingIsCalled` | Yes (M) | Met |
| U5 | `ErrNotFound` and another error come back unchanged from both, no scheduler call | `TestPauseAndResume_FailuresComeBackAndCallNoScheduler` (4 subtests) | Yes for "no scheduler call" (events asserted empty). The pass-through itself is thin, as `TESTING.md` expects | Met |
| U6 | Serialization: 50 rounds pause+resume; 50 rounds resume+delete; 50 rounds resume+update after a pause | `TestPauseAndResume_AreSerialized`, `TestResume_AndDeleteAreSerialized`, `TestResume_AndUpdateAfterAPauseAreSerialized` | Yes (M: mutex removed; all three fail, first at rounds 15, 9, 14 in three runs of the first) | Met |
| U7 | A paused service is not scheduled by `StartChecks` and `UpdateService` (FR-76) | existing `TestStartChecks_StartsEveryServiceThatIsNotPaused`, `TestUpdateService_PausedServiceIsNotScheduled` | Yes: both have a paused case with an unpaused baseline (read) | Met |
| U8 | `RecordCheckResult` with `ErrServicePaused`: nil, state as before, no alert, healthy and unhealthy; unpaused baseline saves and dispatches | `check_result_test.TestRecordCheckResult_PausedServiceDropsTheResult` | Yes (M: `ErrServicePaused` not handled). The baseline inside each subtest shows the alert is otherwise sent | Met |
| H1 | Both operations: 200 with the mapped service, spy gets id, 404, 500 text hidden, one log line with `service_id` and `service_name` only | `handler.TestPauseAndResumeService_Answer200WithTheMappedService`, `_ErrorsMapToTheirCodes`, `_LogOneLineWithTheIDAndNameOnly` | Yes (M: log message changed). The 200 test compares with the `getService` mapping and checks the contract | Met |
| H2 | No session (401) and no CSRF (403) never reach the spy, per operation (NFR-8) | `TestPauseAndResumeService_GateFailuresNeverReachTheSpy` | Yes. It has a baseline where both present reaches the spy | Met |
| H3 | 501 router test untouched | `handler/router_test.go` not in the diff | n/a | Met |
| W1 | `make check` passes | run | n/a | Met |
| W2 | Nothing outside the allowed paths changed | `git diff --name-only main...HEAD`: only the listed `domain`, `handler`, `repository`, `usecase` files and the plan | n/a | Met |

Requirement IDs: FR-75 (R1, U1–U4, H1), FR-76 (R4, U1, U7, U8), FR-77 in part (`paused` in the answer: H1), FR-78 (R1, R2, U1, U3), FR-79 (U3), NFR-8 (H2).

## Plan check (`pause-resume-api.plan.md`, read after the table)

- Every criterion above appears in the plan. None is missing.
- Every ticked item has a test and the test checks the behavior, with one exception: "no service row → `ErrNotFound`" (RS) is ticked, and the plan's judgment calls say it is shown only by the existing tests. That matches what I found (N1).
- The plan's claim that all three serialization tests fail without the mutex is true (I got the same).
- Plan versus diff: no difference found. The plan's claim that `TestStartChecks_...` and `TestUpdateService_PausedServiceIsNotScheduled` already had a paused case is true.
- The plan says `usecase` and `repository` ran 3 times under `-race`; I ran them 3 times too: passed.

## Rule checks (by reading the diff)

- **Dependencies:** `go.mod`, `go.sum`, the frontend manifests, `.env.example` and the Makefile are untouched; no dependency or version changed. No config key added.
- **Scheduler and wiring:** `worker/**`, `cmd/server/main.go`, `problem.go`, `api/**` and migrations are not in the diff.
- **`ErrServicePaused`:** returned only at `repository/service_state.go:47`, handled only at `usecase/check_result.go:68`, not in `problem.go`.
- **No `Start` for a resume:** `setPaused` calls `Restart(view.Service, now)` only; `Start` is not called.
- **No scheduler call when the flag did not change:** both calls are inside `if changed`.
- **Same mutex:** `setPaused` takes `s.editMu`, the field `UpdateService` and `DeleteService` hold. One helper serves both operations, so there is no second copy of the logic.
- **`SetPaused` writes only `paused` and `updated_at`:** a map update of those two columns by id; the flag is read first, in the same transaction. Nothing touches `service_states`.
- **State repository reads `paused` in the same transaction as the write:** yes, at the top of the `Transaction` closure, before `apply`. As the task says, no test can interleave them; read only.
- **Layering and transactions:** the usecase decides, the repository stores, the handler maps (`toAPIService`); the scheduler is called after the commit, never inside the transaction. Repository tests import only `domain`, `repository` and `testutil`; usecase tests use the fakes; handler tests use the spy.
- **Test file rules:** no `_edge` or `_regress` file; new tests are in the existing test file of each source file. No `time.Sleep`; concurrency tests use the fake's `runtime.Gosched()`.
- **Frontend rules:** not applicable.
- **Logging:** the handler logs `service paused` / `service resumed` with `service_id` and `service_name` only; the test checks that no URL or header value leaks.

## Mutation checks run (each reverted; `git status` clean afterwards)

| Break | Result |
|---|---|
| Resume calls `Start` instead of `Restart` | Failed: `TestResumeService_RestartsOnceWithTheServiceAndTheClockTime` and the three serialization tests |
| Scheduler called whether or not `changed` (`if changed \|\| true`) | Failed: `TestPauseService_WhenTheFlagDidNotChangeNothingIsCalled`, `TestResumeService_WhenTheServiceIsNotPausedNothingIsCalled` |
| Paused read dropped in `ServiceStateRepository.Update` | Failed: `TestServiceStateUpdate_PausedServiceIsRefusedAndNothingIsWritten`. The usecase test cannot fail from this break: it uses the fake state repository. A real-layer link between the two is the end-to-end tier, not this task |
| `RecordCheckResult` no longer treats `ErrServicePaused` as a drop (it returns the error, so no alert) | Failed: `TestRecordCheckResult_PausedServiceDropsTheResult`. A direct "alert for a paused service" break needs the paused branch to reach the alert code, which the new handling makes unreachable; the dropped-result behavior is what the test pins |
| Mutex removed from `setPaused` | Failed: all three serialization tests. First failing round of `TestPauseAndResume_AreSerialized` in three runs: 15, 9, 14 (each test stops at its first failing round, so "rounds failed" is at least 1) |
| `SetPaused` writes `updated_at` when unchanged (`if true`) | Failed: `TestServiceSetPaused_PausesAndResumesKeepingEverythingElse` |
| `Stop` removed from pause | Failed: `TestPauseService_SavesTheFlagThenStopsTheSchedulerOnce`, `TestPauseService_StopsEvenWhenTheRequestIsCancelled`, `TestPauseAndResume_AreSerialized` |
| Resume log message changed | Failed: `TestPauseAndResumeService_LogOneLineWithTheIDAndNameOnly` |

## Cases beyond the task file (live run)

I ran the built binary (`REQUIRE_HTTPS=false`, a fresh database) against a local Python server that prints a line per hit, with one HTTP service at a 60 s interval:

- Create → 1 hit. Pause → 200, `paused: true`, state kept (`healthy`, same `last_checked_at`). Pause again → 200, still paused. No further hit while paused.
- Resume → 200, `paused: false`, 1 more hit within 2 s (FR-79). Resume again → 200, no hit.
- An id with a space (`a%20b`) and an unknown id → `404 not_found`, for pause and resume.
- No CSRF token → `403 csrf_failed`; no session → `401 unauthenticated`.
- Pause, then edit (`PUT`) → stays `paused: true`, no hit; resume → 1 hit.
- Pause, then delete → 204; resume of the deleted id → 404.
- Not tried: a real sequence blocked on a slow target while paused (the scheduler's cancel is covered by `update-service-api`'s tests and is not in this task's diff); two concurrent real HTTP requests (the usecase serialization tests cover this with the fake).

## Integration tests

Not run: the task touches no integration-tagged code (`make test-integration` covers the Mailpit mailer tests only), and Docker was not started here. No criterion of this task depends only on an integration test.

## Findings

### Blocking

None.

### Non-blocking

- **N1 — test quality.** The new `services` read in `ServiceStateRepository.Update` has no test for its not-found branch (a state `Update` on an id with no service row). Matters when: someone reorders the read so a missing service row falls through to a state error other than `ErrNotFound`, or a migration drops the foreign key, since then a state row could outlive its service. Until then the old missing-row test gives the same result.
- **N2 — test quality.** `TestPauseAndResume_FailuresComeBackAndCallNoScheduler` checks that the error comes back unchanged, which `TESTING.md` calls not worth testing; the useful half is "no scheduler call". Report only (no trigger).
- **N3 — cosmetic.** The `editMu` comment in `usecase/service.go` has a long second line; `gofmt` and lint do not complain. Report only.
- **N4 — latent bug.** `PauseService` and `ResumeService` commit before the handler maps the view. If `toAPIService` ever fails (it returns an error from `toAPICheck`), the admin sees a 500 for a pause that did happen. Same pattern as `getService`. Matters when: a new check type is added to the domain but not to `toAPIService`.

## Docs or specs that no longer match

- No versions adopted: no dependency was added or changed, so `STACK.md` needs no entry.
- `docs/data-model.md` (line 85, "Only the check-result usecase writes this table…") is still true, but it says nothing of the new rule that a state write is refused for a paused service (FR-76) and that the state repository now reads `services.paused`. Worth a sentence when the user next edits that file.
- `docs/openapi.yaml`: nothing found out of date for `pauseService` and `resumeService`; the responses used (200, 401, 403, 404, 500) match what the handlers and the live run return.
- `docs/manual-checks.md`: no change needed.
