# Task: worker test hardening

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

Four loose ends from the `update-service-api`, `tcp-probe` and `pause-resume-api` verifier reports, which the user chose to track:

1. **A scheduler regression hangs the `worker` package instead of failing it.** The overlap tests in `worker/scheduler_test.go` hold a sequence open and release it only after their assertions. When an assertion fails (`t.Fatal`), the cleanup `Close` waits for the held sequence for ever, and `go test` ends with `panic: test timed out` after 10 minutes, hiding the failing message and every later test. The verifier of `update-service-api` saw it under five mutations. This task makes the release part of the cleanup, so a broken change fails with its own message.
2. **An empty TCP host counts as healthy.** `net.JoinHostPort("", port)` is `:port`, which the standard dialer reads as the local machine, and the runner treats only a nil host as missing. Validation rejects an empty host on save, so the product cannot produce one today; a hand-edited row, or a future save path that skips validation, could. This task makes an empty host a failed or missing setting, never a healthy check.
3. **The TCP "host with a space" test depends on the machine's resolver.** `TestCheckTCP_DialErrors/host with a space, real dialer` uses the real dialer and assumes the resolver rejects the name quickly. This task replaces it with a test that needs no resolver.
4. **The not-found branch of the state repository's service read has no test.** `ServiceStateRepository.Update` reads the service's `paused` flag first and returns `domain.ErrNotFound` when the service has no row. The existing "after service deleted" test passes without that read (the foreign key cascade removes the state row too). This task adds a test that fails without it.

No behavior changes except item 2.

Requirements covered:

- FR-49 and FR-61, in part (item 2): a TCP check with no host is never healthy; the probe reports `could_not_connect` and the runner reports missing settings.
- FR-76, in part (item 4): a result for a service that no longer has a row is dropped and writes nothing, shown by a test that can fail.
- Items 1 and 3 are test reliability (`TESTING.md`); their criteria prove the tests fail fast and need no resolver.

Out of scope:

- Any change to the scheduler itself (`worker/scheduler.go`), to the tests' assertions, or to what the overlap tests prove. Only how a held sequence is released changes.
- Validation of a TCP host or port beyond "not empty" (a port out of range or a host with a space reaches the dialer and fails as `could_not_connect`; `validateTCPCheck` is not changed).
- A whitespace-only host: save trims the host and rejects an empty result, so none is stored; one that reached the probe would fail as `could_not_connect` at the dialer.
- The other findings of those reports (they stay in their reports), the Mailpit integration test, and everything under `frontend/`.

## Prerequisite

`update-service-api`, `tcp-probe`, `pause-resume-api` and `scheduler-test-flake` are merged. The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them): `worker.Scheduler.Restart` with the tests named below (`TestRestart_DoesNotWaitAndDoesNotOverlapTheOldSequence` and its neighbours in `scheduler_test.go`, `holdFirst`); `probe.TCPProber` with its private `dial` field and `dialStub` in `tcp_test.go`; `errMissingTCPSettings` in `worker/check_runner.go`; `ServiceStateRepository.Update` reading the `services` row before the state row; `domain.ErrServicePaused`.

## Role and ownership

Role: Backend.

You may change only: `backend/internal/worker/scheduler_test.go`; `backend/internal/worker/check_runner.go` and `check_runner_test.go`; `backend/internal/adaptor/probe/tcp.go` and `tcp_test.go`; `backend/internal/repository/service_state_test.go`.

You may not change `backend/internal/worker/scheduler.go`, `backend/internal/repository/service_state.go` or any other repository or usecase file, `backend/internal/domain/**`, `backend/internal/adaptor/probe/http*.go`, `backend/internal/testutil/**`, `backend/cmd/server/main.go`, `backend/go.mod`, `backend/go.sum`, `frontend/**`, `e2e/**`, `docs/**` (except your own plan file, `docs/tasks/worker-test-hardening.plan.md`), `.env.example` or the `Makefile`. No configuration key is added.

Shared files this task touches, owned by this task while it runs: `worker/scheduler_test.go`, `worker/check_runner.go`, `adaptor/probe/tcp.go`. Tasks that may run at the same time: `test-service-check-api` (it changes `adaptor/probe/http.go`, `domain/check.go`, the handler, a new usecase and `main.go`; it calls `CheckTCP` and does not change `tcp.go` or the runner) and the frontend group's tasks.

## Operations used

None. No operation of `docs/openapi.yaml` is involved.

## Behavior

### 1. Release a held sequence in a cleanup (`worker/scheduler_test.go`)

Every test that holds a sequence open and releases it by hand uses one helper for the release. Those tests are the ones that call `close(release)` today: `TestScheduler_OverrunStartsNextAtOnce`, `TestClose_WhileStartWaits`, `TestClose_CancelsRunningAndWaitingAndWaitsForBoth`, and the tests that use `holdFirst` (`TestRestart_DoesNotWaitAndDoesNotOverlapTheOldSequence`, `TestRestart_ChainRunsOnlyTheLast`, `TestStart_AfterRestartWaitsForTheChain`, `TestRestart_WhileStartWaits`, `TestStop_ThenStartWaitsForTheStoppedGoroutine`, `TestStop_ThenRestartWaitsForTheStoppedGoroutine`, `TestClose_WaitsForAStoppedGoroutine`, `TestClose_WhileRestartWaits`, `TestClose_WhileStartWaitsForAStoppedGoroutine`), and any other test the builder finds that blocks a sequence on a channel other than its context.

- The helper gives the test a release that can be called more than once (a `sync.Once` around the close), and registers it with `t.Cleanup` **after** `newSchedSetup` registered `sched.Close` (cleanups run last in, first out), so on every way out of the test, including a `t.Fatal`, the release runs first and `Close` can then finish.
- The tests call that release where they call `close(release)` today; the order of events inside each test, and every assertion, is unchanged.
- `holdFirst` may take the test and register the cleanup itself, or return the release; the shape is the builder's choice. The release channel is closed exactly once whatever the order of the explicit call and the cleanup.
- **`holdFirst` must not wait for a context that is never cancelled.** Today it blocks on `ctx.Done()` and only then on the release, so when a broken scheduler never cancels the old entry (the `Restart` that forgets `old.cancel()`), closing the release does not free it. It waits for either the context to end or the release to close, then signals `cancelled` (once) if it had not, and then waits for the release. In a passing run the context ends first, as today, so every test's order of events and assertions is unchanged.
- Nothing else changes: no timeout is added or raised, no `time.Sleep`.

### 2. An empty TCP host

- **Probe (`adaptor/probe/tcp.go`):** in `CheckTCP`, after the caller-context check and the zero-timeout check and before the dial, a check whose host is the empty string returns `could_not_connect` (a result, no error, no HTTP status, no rule field, the same value the dial-error path returns) without calling the dial function. The order of the existing rules is unchanged: an ended caller context is the context's error, a timeout of zero or less is `timed_out`, then the empty host, then the dial.
- **Runner (`worker/check_runner.go`):** a TCP service whose `TCPHost` is nil, **or points to the empty string**, or whose `TCPPort` is nil, is the existing `errMissingTCPSettings` (text unchanged): nothing is probed, waited for or recorded, and the scheduler logs it as `check sequence failed`, as for a nil host today. No new error value, message or log line.
- The empty-host rule is for the empty string only; no trimming is added.

### 3. The space-in-host test

Replace the subtest `host with a space, real dialer` with one that uses the replaceable dial function: it checks that a host with a space reaches the dialer unchanged inside the joined address (`bad host:81`), and that a dial error such as a name-lookup error is `could_not_connect`, as the other rows of the table do. No test of the probe uses the real dialer with a name that needs a lookup. (The real dialer is still used for the listener tests on `127.0.0.1`, which need no resolver.)

### 4. The not-found branch of the state update (`repository/service_state_test.go`)

A new test makes a state row that has no service row, and shows that `Update` neither applies nor writes. A foreign-key cascade normally removes the state row with its service, so the test removes the service row with foreign keys off on one pinned connection (`db.Connection`, `PRAGMA foreign_keys = OFF` before the delete and `ON` after, the `ON` registered with `t.Cleanup` or `defer` before the delete so a failed assertion cannot return the connection to the pool with the pragma off), leaves the state row in place, then calls `Update` and expects `domain.ErrNotFound`, no call of the apply function, and the orphaned state row unchanged. Without the `services` read at the top of `Update` the call would find the state row and write it, so the test fails.

### Known gaps

- The overlap tests still prove an absence while the old sequence is held, so they stay statistical (the existing `spin` helper and the notes of `update-service-api` apply); this task changes only what happens when they fail.
- The empty-host guard lives in two places on purpose: the runner stops before probing a malformed service, and the probe is safe on its own for any caller (`testServiceCheck` validates, but the probe must not depend on it).

## Structure

- `worker/scheduler_test.go`: the release helper next to `holdFirst`; the tests above call it.
- `adaptor/probe/tcp.go`: one early return. `adaptor/probe/tcp_test.go`: the replaced subtest and a new test for the empty host (see below).
- `worker/check_runner.go`: the host condition in the TCP case of the attempt builder. `worker/check_runner_test.go`: the missing-settings test gains the empty-host row.
- `repository/service_state_test.go`: the new test.

## Dependencies

None. No `go.mod` or `go.sum` change.

## Acceptance criteria

All run under `-race`; none is an integration test; no `time.Sleep`.

**Scheduler tests**

- By reading: every test that holds a sequence on a channel releases it through the helper and its cleanup; no test calls `close` on the release channel directly any more; the cleanup is registered after `sched.Close`'s.
- By running, with the package run as `go test -race -timeout 120s ./internal/worker/`, each of these scratch mutations of `scheduler.go` (restored after each) ends the package with `FAIL` and **no `panic: test timed out`**: (M1) `Stop` deletes the entry from `entries` at once, as the scheduler did before `update-service-api`; (M7) `Restart` unlocks `mu` and then waits for the old goroutine's `done` in the caller; (M8) `Restart` takes `startMu` before `mu`; (M9) `run` closes `done` before it waits for the previous goroutine; (W4) `Restart` does not call `cancel` on the old entry. These are the `update-service-api` verifier's mutations, which all ended in a timeout. For M1, M8 and M9 the failing tests fail by their own assertion messages; for M7 and W4 the run may also end in another panic of the mutant (for example `sync: WaitGroup is reused before previous Wait has returned`), which is acceptable: what is not acceptable is the test timeout. The plan and the report list, for each mutation, the failing tests or the panic.
- A test that holds a sequence and then fails an assertion on purpose (a scratch `t.Fatal` before the release, removed after) ends in a failure within the `guard` bound, not a hang.
- On the unmodified code, all of `worker/scheduler_test.go` passes 30 times under `-race`.

**TCP probe and runner**

- Probe: a check with an empty host and a listener open on the port the check names is `could_not_connect`, not healthy, with no HTTP status and no rule field; the dial function is not called (a stub that counts calls). A check with a non-empty host in the same test, same port, is healthy (the baseline).
- Probe: a timeout of zero with an empty host is `timed_out` (the existing rule comes first), and an already ended context with an empty host is the context's error.
- Probe: the replaced space-in-host subtest asserts the address `bad host:81` reaches the dial function and that a lookup error gives `could_not_connect`; no probe test calls the real dialer with a name that needs a lookup.
- Runner: a TCP service with `TCPHost` pointing to `""` returns the missing-settings error (the tests are in `package worker_test`, so they compare the error text `check runner: tcp service has no host or port`, which is unchanged), probes nothing (the fake TCP prober's call count is zero), records nothing, makes no timer (the fake clock's timer count is zero), and writes no `check finished` line (the empty-host row is added to `TestRun_TCPMissingSettings` and to the "settings missing" case of `TestRun_LogNoLine`, whichever of them asserts each of these); the existing nil-host and nil-port rows and the healthy baseline still pass.

**State repository**

- The new test: `Update` on a service whose row is gone but whose state row remains returns `domain.ErrNotFound`, does not call the apply function, and leaves the state row as it was. It passes against the current code, and fails when the `services` read is removed from `Update` (a scratch change).
- The existing `ServiceStateRepository` tests pass unchanged, and the pinned connection's `foreign_keys` pragma is back on after the test (a later `PRAGMA foreign_keys` on that connection reads 1, or the test uses its own database file as the others do, so no other test is affected).

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- **By reading:** `scheduler.go` and `service_state.go` are untouched; no assertion was removed or weakened in any scheduler test; no `time.Sleep`, no raised `guard`, no new timeout; the release helper is a `sync.Once`; the runner's empty-host test has no trimming; the probe's empty-host return comes after the context and timeout checks and before the dial.
- **Mutation checks** (restore after each): the five scheduler mutations above, as defined there, run with `-timeout 120s` (the result must be `FAIL` and not a test timeout); remove the empty-host return from the probe and see its test fail; remove the `== ""` from the runner and see its test fail; remove the `services` read from `ServiceStateRepository.Update` and see the new repository test fail; make the release helper register its cleanup before `newSchedSetup` (so `Close` runs first) and see a held test hang or fail the "by running" check.
- **Inputs to try:** a host of one space, a host with a trailing dot, port 0 and 65536 (they reach the dialer and fail as `could_not_connect`; not changed here).
- **Run it:** the worker package 30 times under `-race`, the probe and repository packages three times; report failures.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths (`scheduler.go`, `service_state.go`, `testutil`, a usecase, a migration, a dependency).
- The merged code differs from "Prerequisite" (a renamed helper or test, a changed `Update`).
- A convention in `CONVENTIONS.md` or `TESTING.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check` (and the integration-test command from `TESTING.md` if you touched code with integration tests; none is expected), commit in small steps (the four items separately), push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), the failing tests of each scheduler mutation, which tests ran, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle.
