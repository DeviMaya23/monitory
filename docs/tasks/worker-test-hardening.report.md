# Verifier report: worker test hardening

Verifier branch: `verify/worker-test-hardening` (started from `feat/worker-test-hardening` at `789cee0`; only this report is added, no test needed a change).

**Result: no Blocking findings.** `make check` passed (after `npm ci` in `frontend/`, a fresh checkout has no installed dependencies; no tracked file changed).

| Check | Result |
|---|---|
| `make check` | run, passed (backend lint 0 issues, backend and frontend tests, builds) |
| Integration tests (`make test-integration`) | not run: the Docker daemon is not running here. The only integration-tagged file is `adaptor/mailer/mailer_integration_test.go`, which this task does not touch. No criterion of this task depends only on an integration test |
| Built app, live run | not run: a test-only task plus one early return and one condition; every behavior is reachable through the unit tests. Nothing in the app can produce an empty host (validation rejects it on save) |
| Worker package, 30 times, `-race` | passed (`-count=30`, whole package, 26 s) |
| Probe and repository packages, 3 times, `-race` | passed |

## Criteria

"Real?": yes means the test fails if the behavior is removed (shown by a mutation below), no means it could pass without it.

| # | Criterion | Test or evidence | Real? | Verdict |
|---|---|---|---|---|
| 1 | Every held-sequence test releases through the helper and its cleanup; no direct `close` of the release channel; cleanup registered after `sched.Close`'s | By reading: `newRelease(t)` (`scheduler_test.go:825`, `sync.Once`, `t.Cleanup`) is used in all 3 named tests and all 9 `holdFirst` tests; the only `close(release)` is inside the helper; every `newRelease` call comes after `newSchedSetup`. No other test blocks on a channel other than its context (`grep "<-"`) | yes (reversed-order mutation) | met |
| 2 | M1, M7, M8, M9, W4 each end `FAIL` with no `panic: test timed out` (`-timeout 120s`) | Run, see "Mutation checks": all five `FAIL`, zero timeouts | yes | met |
| 3 | A scratch `t.Fatal` before a release fails within `guard`, no hang | Scratch `t.Fatal("scratch")` before `doRelease()` in `TestClose_WhileRestartWaits`: `FAIL` in 0.00 s, message `scratch` shown | yes | met |
| 4 | Unmodified code: `scheduler_test.go` passes 30 times under `-race` | Whole worker package `-count=30`: passed | n/a | met |
| 5 | Probe: empty host with a listener on the port is `could_not_connect`, no status, no rule, dial not called; non-empty host on the same port is healthy | `TestCheckTCP_EmptyHost/not_healthy_and_not_dialled` and `/baseline:_a_host_on_the_same_port_is_healthy`. The stub dials for real, so without the guard `:port` reaches the listener | yes (guard removed: row fails) | met (FR-49, FR-61) |
| 6 | Probe: zero timeout with empty host is `timed_out`; ended context with empty host is the context's error | `TestCheckTCP_EmptyHost/a_zero_timeout_comes_first`, `/an_ended_context_comes_first` | partly: they pin the order only if the guard moved above those checks. Moving it is the only way they fail; the probe source has the guard after both (read) | met |
| 7 | Probe: space-in-host subtest asserts `bad host:81` reaches the dial function and a lookup error is `could_not_connect`; no probe test uses the real dialer for a name needing lookup | `TestCheckTCP_DialErrors/host_with_a_space,_lookup_error`; `grep` finds no real dialer use except on `127.0.0.1` listeners | yes (the address assertion fails if the host were altered) | met |
| 8 | Runner: `TCPHost` pointing to `""` is the missing-settings error with its text, nothing probed, nothing recorded, zero timers, no `check finished` line; nil host, nil port and the baseline still pass | `TestRun_TCPMissingSettings/empty_host` (text via `EqualError`, `tcp`/`prober` call counts, recorder, `timerCount`), `TestRun_LogNoLine/settings_missing,_empty_host`; baselines in the same tests | yes (`== ""` removed: both rows fail) | met (FR-49, FR-61) |
| 9 | State repository: `Update` with the service row gone and the state row kept returns `ErrNotFound`, apply not called, state row unchanged; passes now, fails without the `services` read | `TestServiceStateUpdate_ServiceRowGoneButStateRowRemains` (includes a baseline write while the service exists) | yes (read replaced by a `Find`: test fails) | met (FR-76) |
| 10 | Existing state repository tests unchanged; `foreign_keys` back on | Existing tests untouched in the diff; the test registers `PRAGMA foreign_keys = ON` in a `defer` before the delete and reads it back as 1 (`require.Equal(t, 1, foreignKeys)`) | n/a | met |
| 11 | `make check` passes | run, passed | n/a | met |
| 12 | Nothing outside the allowed paths changed | `git diff main..HEAD --stat`: the four test files, `check_runner.go`, `tcp.go`, and the plan. No `go.mod`, `go.sum`, `scheduler.go`, `service_state.go`, docs (except the plan) | n/a | met |

Criterion 2 needed an addition beyond the task text (see Non-blocking finding 1); the criterion itself is met.

## Plan check (read after the table above)

- Every criterion of the task file appears in the plan, in the same order, and every ticked item has a test that exists and checks the behavior (I mutated each one).
- Plan versus diff: the plan's lists of failing tests per mutation match what I saw in kind. My runs failed fewer tests for M1 (2 of the 4 the plan lists), M8 (1) and M9 (7 versus 1); the plan's lists are from a different run of statistical tests, and the criterion (FAIL, no timeout) holds in both. Not a defect.
- The plan states two departures from the task text (a `returnsWithin` around two bare `Restart` calls; a bounded `Close` in the shared cleanup). Both are in the diff exactly as described. The plan also says the runner test rows are in the commit before the guard commit; that matches `git log` (`7614ed9`, `ac78eb8`).
- The plan says integration tests were not run because Docker is down; the same holds here.
- No difference found that the plan hides.

## Rule checks

- **Dependencies:** none added, `go.mod`/`go.sum` untouched, no pinned version changed.
- **Role and paths (ROLES.md):** Backend role, test files and two named source files only; no `docs/**` besides the plan.
- **Verifier checks by reading:** `scheduler.go` and `service_state.go` untouched; no assertion removed or weakened in the scheduler tests (the diff has no removed `assert`/`require` line); no `time.Sleep`; `guard` still `5 * time.Second`; the release helper is a `sync.Once`; the runner has no trimming (`*service.TCPHost == ""` only); the probe's empty-host return is after the context check and the timeout check and before the dial.
- **CONVENTIONS.md:** layer boundaries (worker tests import no repository or adaptor; repository test imports no usecase or handler), no limit literal, no logging change, no `nolint`. Data scoping and transactions are not touched (the repository test only reads through `Update`'s own transaction). `golangci-lint` reports 0 issues.
- **TESTING.md:** tests are rows or subtests in the existing files; no `_edge`/`_regress` file; no real timers; the repository test uses its own `testutil.NewDB` file and does not mock the database.

## Mutation checks run

All restored after each (`git status` clean at the end).

| Mutation | Result |
|---|---|
| M1: `Stop` deletes the entry at once | `FAIL`, no timeout: `TestStop_ThenStartWaitsForTheStoppedGoroutine`, `TestStop_ThenRestartWaitsForTheStoppedGoroutine` |
| M7: `Restart` unlocks `mu`, waits for `old.done` in the caller | `FAIL`, no timeout; ends in `panic: sync: WaitGroup is reused before previous Wait has returned` (accepted by the task) |
| M8: `Restart` takes `startMu` before `mu` | `FAIL`, no timeout: `TestRestart_WhileStartWaits` (5.00 s, the `returnsWithin` the builder added) |
| M9: `run` closes `done` before waiting for the previous goroutine | `FAIL`, no timeout: `TestClose_WhileRestartWaits`, `TestRestart_ChainRunsOnlyTheLast`, `TestRestart_DoesNotWaitAndDoesNotOverlapTheOldSequence`, `TestRestart_WhileStartWaits`, `TestStart_AfterRestartWaitsForTheChain`, `TestStop_LeavesNoBookkeepingAfterTheGoroutineEnds`, `TestStop_ThenRestartWaitsForTheStoppedGoroutine` |
| W4: `Restart` does not cancel the old entry | `FAIL`, no timeout (61 s): six `Restart` tests fail after 10 s each |
| W4 with the shared cleanup reverted to plain `t.Cleanup(sched.Close)` (to see whether the builder's addition is needed) | `panic: test timed out after 1m0s`. The addition is what makes criterion 2 hold for W4 |
| Probe: `check.Host == ""` guard disabled | `TestCheckTCP_EmptyHost/not_healthy_and_not_dialled` fails |
| Runner: `\|\| *service.TCPHost == ""` removed | `TestRun_TCPMissingSettings/empty_host` and `TestRun_LogNoLine/settings_missing,_empty_host` fail |
| State repository: the `services` read replaced by a `Find` that never returns not-found | `TestServiceStateUpdate_ServiceRowGoneButStateRowRemains` fails |
| Release cleanup registered before `newSchedSetup` (so `Close` runs first) plus a scratch `t.Fatal` in `TestRestart_ChainRunsOnlyTheLast` | Fails in 5.00 s with `Close did not return: a sequence goroutine was never cancelled`; without the builder's bounded `Close` it would hang |
| Scratch `t.Fatal` before the release in `TestClose_WhileRestartWaits` | `FAIL` in 0.00 s with the scratch message |

## Findings

### Blocking

None.

### Non-blocking

1. **The shared cleanup bounds `Close` with `guard`, which the task said not to add.** (decision needed) `newSchedSetup` now runs `Close` through `returnsInTime`, waiting at most the existing 5 s `guard`, then `t.Error`. The task says "no timeout is added or raised"; the builder disclosed this and chose the acceptance criterion (no `test timed out` for W4) over that sentence. I confirmed it is needed: without it, W4 ends in the test timeout. It is the only way, short of changing `scheduler.go`, to meet both. Matters when: you want the task text strictly followed, in which case W4 has to be dropped from the "no timeout" criterion. After a failure the leaked goroutine lives until the test process ends.
2. **Two bare `Restart` calls are now wrapped in `returnsWithin`** (`TestStart_AfterRestartWaitsForTheChain`, `TestClose_WhileRestartWaits`), and `TestRestart_WhileStartWaits` and the `holdFirst` tests were otherwise unchanged. This adds an assertion (each `Restart` returns at once), and removes none; it is how M7 and M8 fail instead of hang. Category: test quality. Matters when: report only (no trigger; it is consistent with the task's intent).
3. **`TestClose_WhileStartWaits` blocks on its own `<-ctx.Done()` / `close(oldCancelled)`, not `holdFirst`.** A scheduler that never cancels would leave it waiting on `ctx.Done()`, which the release helper does not free. The cleanup bound from finding 1 turns that into a failure, so it does not hang. Category: test quality. Matters when: report only.

Inputs tried (scratch test, removed): host `" "`, `"localhost."`, port 0, port 65536 with host `127.0.0.1`, and an empty host with port 0 and 65536. All return unhealthy with no error and no hang; an empty host never reaches the dialer. Race detector runs over concurrent `Restart` and `Start`/`Stop`/`Close` tests passed 30 times.

## Docs or specs that no longer match

- None. `docs/openapi.yaml` and `docs/requirements.md` are unaffected; no dependency or version was adopted, so `STACK.md` needs no entry. `docs/tasks/backlog.md` does not list these four loose ends, so nothing needs dropping.
- One note for `TESTING.md` (not wrong today): the new "bounded `Close` in a cleanup" pattern in `scheduler_test.go` is not described there; add it if the user wants held-sequence tests to follow it.
