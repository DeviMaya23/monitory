# Verification report: delivery retry

Branch: `verify/delivery-retry` (the session's branch, reset to the builder's `feat/delivery-retry` at `6ee079e`, plus the verifier's test-only commit). No Blocking findings.

Test file abbreviation: T = `backend/internal/worker/alert_dispatcher_test.go`.

## `make check` and integration tests

- `make check`: run, passed. The first run failed `TargetDialog.test.tsx` ("adds a header row…", a 5 s timeout while the machine was busy; frontend not touched by this diff). The file passed alone (58/58) and the full `make check` passed on the rerun (backend race tests, lint 0 issues, frontend 584/584). The builder's plan records the same first-run failure.
- `make test-integration`: not run. No integration test covers `worker/` or `main` wiring, and the task file says none applies. No criterion depends only on integration tests.
- Not provable here: timing against the real clock, a real SMTP server or a real webhook receiver. The tests use `clock.Fake` and fakes.
- Live run of the built app: not done. Nothing is served and a retry needs a failing real target.

## Acceptance criteria

"Real?" = the test fails if the behavior is removed (confirmed by the mutation named, where one was run).

| Criterion | Test | Real? | Result |
|---|---|---|---|
| Success at once: 1 call, Pending 0, `delivered` attempts 1, no attempt-failed line (FR-85, NFR-5) | T `TestSequence_SuccessAtOnce` | Yes: skip-wait and one-too-many change the lines/calls | Met |
| Fail, fail, succeed; exactly 7 s, 7 s − 1 ns short; attempt-failed lines with reasons; no 4th call | `TestSequence_FailFailSucceed` | Yes: fixed-30s, skip-wait, one-too-few fail it | Met |
| Always failing: 4 calls at 0/7/14/21 s, `failed` attempts 4, 3 attempt-failed lines, no 5th call | `TestSequence_AlwaysFailing` | Yes: one-too-many, one-too-few, skip-wait, fixed-30s | Met |
| Interval from the policy (45 s, not 7 or 30) | `TestSequence_IntervalComesFromThePolicy` | Yes: fixed-30s | Met |
| `Retries` 0: one call, no timer, `failed` attempts 1 | `TestSequence_ZeroRetriesFailsAtOnce` | Yes: one-too-many | Met |
| Email and webhook each, and together | `TestSequence_EmailAndWebhook` | Yes (own fakes, different attempt counts) | Met |
| Independence (FR-83): a waiting target does not delay another; two failing retry on one tick | `TestSequence_TargetsAreIndependent` | Yes: skip-wait, sequential, wait-ignores-close | Met |
| No address, URL, header, names or message in any line; ids and status on each | `TestSequence_LogsHoldIdsOnly`, `TestDispatch_FailureAndAbandonLogsNeverHoldTheAddress`, `TestDispatch_WebhookOutcomeLogs` | Yes: log-address, log-url-on-failed | Met |
| `Close` while waiting: abandoned, no reason, Pending 0, prompt, no later call | `TestClose_WhileWaiting` | Yes: no-timer-stop, wait-ignores-close, no-recheck | Met |
| `Close` while an attempt is blocked: cancelled, waited for, abandoned whatever the error; success after `Close` is `delivered` | `TestClose_CancelsAndWaitsForSendsInProgress`, `TestClose_WebhookSends`, `TestClose_LaterAttemptIsCancelled`, `TestClose_ASendThatSucceedsAfterCloseIsDelivered` | Yes: no-cancel-in-close, retry-after-close | Met |
| Second `Close`; `Dispatch` after `Close` drops | `TestClose_SecondCallAndDispatchAfterClose` | Unchanged test; not mutated | Met |
| Newer alert ends a waiting sequence (same and opposite status): no advance, timer stopped, no further call, new targets retried | `TestSupersede_WaitingSequence` | Yes: no-supersede-on-dispatch, wait-ignores-supersede, no-timer-stop | Met |
| Another service is not affected | `TestSupersede_OtherServiceIsNotAffected` | Yes: supersede-across-services | Met |
| Attempt in progress: not cancelled; success counts; failure with retries left is `superseded`; last-attempt failure is `failed` | `TestSupersede_AttemptInProgress` | Yes after my fix (below): inflight-cancelled survived the builder's version | Met (after fix) |
| Attempt 1 always made | `TestSupersede_FirstAttemptIsAlwaysMade` (50 rounds) | Yes: skip-attempt1 | Met |
| Wake-up re-check (superseded; closed) | `TestSupersede_RecheckAfterWakeUp` (40 rounds each) | Yes: no-recheck fails both subtests | Met |
| Ended sequence logs nothing on a newer alert | `TestSupersede_EndedSequenceLogsNothing` | Partly: a mutation that logs for ended sequences was not run; the code cannot, since the loop returns | Met |
| Two `Dispatch` calls in a row supersede only the first | `TestSupersede_SecondDispatchIsNotSuperseded` | Yes: supersede-across-services, no-supersede-on-dispatch | Met |
| Races: Dispatch (one and several services) with Close, `-race` | `TestDispatch_RacingDispatchesAndClose`, `TestDispatch_RacingCloseNeverSendsAfterCloseReturned` | Yes: no-timer-stop, wait-ignores-close fail the first | Met |
| Old once-tests run with `Retries` 0; other tests setup-only | `TestDispatch_EmailTargetIsSentOnceWithoutRetry`, `TestDispatch_WebhookTargetIsSentOnceWithoutRetry` | Yes: one-too-many, one-too-few | Met |
| Hang mutations (no cancel in `Close`, `Dispatch` waits, sequential) fail by assertion within the deadline | many | Not met in the builder's version (see Finding 1). Met after my test fix | Met (after fix) |
| Wiring read: policy from the two config values, `clock.Real{}`, close order kept | `main.go` diff | n/a (read) | Met |
| Repo-wide: `make check`; no change outside allowed paths | `git diff main...HEAD` | n/a | Met: only `main.go`, the two worker files and the plan |

## Plan check

- Every criterion has a plan item; none missing.
- Every ticked item names a test that exists and checks the behavior, with one weakness: the "attempt in progress is not cancelled" check read `ctx.Err()` once, straight after the newer `Dispatch`, so a cancel arriving from another goroutine passed it (mutation survived). Fixed below.
- The hang-mutation item is ticked ("fail by assertion"), but two of the three still hung the package (Finding 1).
- Plan says the wake-up re-check is held "via a gate in the fake clock wrapper"; the diff holds it with a hook on the test's log buffer, inside the write of `alert delivery attempt failed`. The plan's judgment-call section describes the hook correctly, so only that checklist line is wrong.
- Plan: "no-cancel one after the tests' own 2 s deadlines, not by hanging". That held for `Close` but not for the other two hang mutations.
- Plan's test names and its note that `make check` failed once on a frontend test match what I saw.

## Rule checks

- Layering: `worker` imports `domain` and `pkg/clock` only. `time` is imported for `time.Duration` and `time.Second` only; no `time.Now`, `Sleep`, `After` or `NewTimer` in the file.
- No hardcoded numbers: no 3, 30 or 90 in the source. The interval and the count come from `RetryPolicy`.
- Goroutines: one per target, counted in the wait group, started in `Dispatch` under the mutex; no timer callbacks. The wait selects on the timer, `d.ctx.Done()` and `rec.superseded`; `timer.Stop()` runs after every wait. The re-check order is context then superseded.
- Record: `latest` is read and replaced only under `d.mu` in `Dispatch`. Sequences read `rec.superseded` (a channel, closed once, under the mutex) without the lock. The in-flight attempt uses `d.ctx`, not a per-sequence context.
- Logs: every call carries only `service_id`, `target_id`, `status`, `attempt(s)` and `reason` (the error text). No address, URL, header, name or message.
- No stored change: no migration, repository call or write to `targets`. `go.mod`, `go.sum`, `.env.example` and `platform/config` unchanged. No config key added.
- `CONVENTIONS.md`: layer boundaries and data scoping are not touched; no transactions here.
- STACK.md: no dependency added.

## Mutation checks run

Each applied to `alert_dispatcher.go`, run with `go test -race ./internal/worker`, then reverted (`git checkout`).

| Mutation | Result |
|---|---|
| skip the re-check after the timer | failed: `TestSupersede_RecheckAfterWakeUp` (both), `TestSupersede_WaitingSequence`, `TestClose_WhileWaiting` |
| skip attempt 1 for a superseded sequence | failed: `TestSupersede_FirstAttemptIsAlwaysMade` |
| one retry too many | failed: once-tests, `TestSequence_AlwaysFailing`, others |
| one retry too few | failed: once-tests, `TestSequence_AlwaysFailing`, others |
| skip the wait | failed: `TestSequence_*`, `TestClose_WhileWaiting`, `TestSupersede_OtherServiceIsNotAffected` |
| fixed 30 s | failed: `TestSequence_AlwaysFailing`, `TestSequence_IntervalComesFromThePolicy` (and others) |
| retry after `Close` | failed: `TestClose_*` |
| timer not stopped | failed: `TestClose_WhileWaiting`, `TestSupersede_WaitingSequence`, `TestDispatch_RacingDispatchesAndClose` |
| keep waiting after a newer alert (drop the supersede case in the wait) | failed: `TestSupersede_WaitingSequence` |
| wait ignores `Close` | failed: `TestClose_WhileWaiting`, `TestSequence_TargetsAreIndependent`, `TestDispatch_RacingDispatchesAndClose` |
| cancel the attempt in progress on a newer alert | **survived** the builder's test; failed `TestSupersede_AttemptInProgress/the attempt is not cancelled` after my strengthening |
| supersede across services | failed: `TestSupersede_*` several |
| last attempt's failure logged as `superseded` | failed: `TestSupersede_AttemptInProgress` (last-attempt and later-attempt subtests) |
| log the address in an attempt line | failed: `TestSequence_LogsHoldIdsOnly` |
| log the URL in the `failed` line | failed: `TestSequence_LogsHoldIdsOnly`, `TestDispatch_FailureAndAbandonLogsNeverHoldTheAddress`, `TestDispatch_WebhookOutcomeLogs` |
| no cancel in `Close` | failed by assertion within the deadline (`TestClose_*`) |
| `Dispatch` waits for the sequences | builder's tests: package hung to the timeout; after my fix: fails by assertion, many tests (slow: about 2 s each, so a cap of 500 s was needed to let it finish) |
| targets run one after the other | same as the previous row |
| no supersede on `Dispatch` (never close the older record) | failed: `TestSupersede_*` |

## Findings

### Blocking

None.

### Non-blocking

1. **Test quality, fixed by me: two of the three "hang" mutations still hung** (a task criterion). `TestDispatch_ReturnsWhileASendIsBlocked` and others called `Dispatch` on the test goroutine with no deadline, so "`Dispatch` waits for the sends" and "targets run one after the other" blocked the whole package until Go's timeout instead of failing an assertion. I added `dispatchWithin` and `waitGroupWithin` helpers (fail after the 2 s deadline) and used them for every synchronous `Dispatch` call and every bare `wg.Wait()` in the file (45 and 4 call sites). No assertion was changed or removed. Matters when: someone breaks `Dispatch` into a blocking call; without the fix the CI job hangs.
2. **Test quality, fixed by me: the "attempt in progress is not cancelled" check was a single read.** It passed under a mutation that cancels the attempt when a newer alert arrives. The subtest now watches the context for 50 ms of real time while yielding (it uses the real clock, as a "nothing happened" check; it never passes on a failure, it only waits). Matters when: someone gives each sequence its own context.
3. **Latent bug, report only: a negative `Retries` retries forever** (`attempt == 1+Retries` is never true). The configuration guarantees a minimum of 0, as the task says, so it cannot happen today. Matters when: the minimum in `platform/config` is lowered or the dispatcher is built from another source. Report only (no trigger today beyond that).
4. **Test quality: one mutation (`delivered` requires not superseded) was run once and its failing test list was not inspected.** It failed at least one test; the expected failing test is `TestSupersede_AttemptInProgress/success counts`. Matters when: nothing today. Report only.

## Docs or specs that no longer match

- `docs/requirements.md` FR-85 already holds the newer-alert sentence (v0.45); nothing to add.
- `docs/openapi.yaml`: no change needed (no operation touched).
- `STACK.md`: no dependency or version adopted by this task, so nothing to record. The "Alert delivery worker" row still reads correctly.
- `docs/tasks/backlog.md` line 71 (the "Left out of `alert-dispatch`" note): "makes one attempt per target with no retry" is out of date once this merges. The retry part is now done; the rest (`last_delivery_failed` never set, finer reasons) stays for `delivery-outcome`.
- `docs/data-model.md`: unchanged, nothing stored.
