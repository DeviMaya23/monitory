# Plan: scheduler test flake

Branch: feat/scheduler-test-flake. Only file changed besides this plan: `backend/internal/worker/scheduler_test.go`.

## Checklist

- [x] Reproduce first on the unchanged file: 8 x 300 for each of the three tests, 8 x 60 for the whole file (`scheduler_test.go`; counts below)
- [x] `countingTimer.Stop` calls the inner `Stop` first, then sends on `stopped`, returns the inner result (`scheduler_test.go`, `TestStop_DuringWait`)
- [x] `TestStart_ReplacesRunningService`: the second sequence reads `totals()` itself and sends it over a buffered channel; test asserts 2 started, 1 ended; no `totals()` read after `Start` returns (`scheduler_test.go`)
- [x] `TestScheduler_ContextWinsOverFiredTimer`: the hook signals when done; `Close` only after that signal (`scheduler_test.go`)
- [x] After the change: same four stress runs have no failure (counts below)
- [x] `make test-backend` three times, no failure (counts below)
- [x] Assertions unchanged in meaning; no sleep, no `guard` change, no retry; only the test file changed
- [x] `make check` passes
- [x] Integration tests: not applicable (test-only change to a unit-test file; `make test-integration` not needed) - not run: no integration-tested code touched

## Results

Stress recipe: `-race` test binary, 8 copies at once.

| Run | Before (default-branch file) | After |
|---|---|---|
| `TestStart_ReplacesRunningService` 8x300 | 4 failed ("expected 1, actual 2" on started/ended totals) | 0 |
| `TestScheduler_ContextWinsOverFiredTimer` 8x300 | 16 failed (`expected 1`, actual 2 to 9 sequence calls) | 0 |
| `TestStop_DuringWait` 8x300 | 6 failed ("the timer is stopped": expected 0, actual 1) | 0 |
| whole file 8x60 | 7 failed (5 ContextWins, 1 Replaces, 1 DuringWait) | 0 |

`make test-backend` x3 after the change: 3 passes, 0 failures.
`make check`: passed (after `npm ci` in `frontend/`; a fresh checkout had no eslint).
Integration tests: not run: test-only change to `scheduler_test.go`, no integration-tested code touched; `make test-integration` not needed.
Test binaries deleted afterwards.

## Judgment calls

- The "second call sends" channel carries a small struct (started, ended); the send is non-blocking via `select`/`default`.
- In `TestStart_ReplacesRunningService` the wait for the reading uses `guard`, and `t.Fatal`s if it never arrives.
- In ContextWins, the hook-finished channel is created per round, and the wait uses `guard` with `t.Fatal`.
- Ran `npm ci` in `frontend/` so `make check` could run its frontend lint; nothing tracked changed.
- Did not run the verifier's mutation checks or `-test.cpu` variations; these are the verifier's.
