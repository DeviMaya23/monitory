# Plan: scheduler test flake

Branch: feat/scheduler-test-flake. Only file changed besides this plan: `backend/internal/worker/scheduler_test.go`.

## Checklist

- [ ] Reproduce first on the unchanged file: 8 x 300 for each of the three tests, 8 x 60 for the whole file (`scheduler_test.go`; counts below)
- [ ] `countingTimer.Stop` calls the inner `Stop` first, then sends on `stopped`, returns the inner result (`scheduler_test.go`, `TestStop_DuringWait`)
- [ ] `TestStart_ReplacesRunningService`: the second sequence reads `totals()` itself and sends it over a buffered channel; test asserts 2 started, 1 ended; no `totals()` read after `Start` returns (`scheduler_test.go`)
- [ ] `TestScheduler_ContextWinsOverFiredTimer`: the hook signals when done; `Close` only after that signal (`scheduler_test.go`)
- [ ] After the change: same four stress runs have no failure (counts below)
- [ ] `make test-backend` three times, no failure (counts below)
- [ ] Assertions unchanged in meaning; no sleep, no `guard` change, no retry; only the test file changed
- [ ] `make check` passes
- [ ] Integration tests: not applicable (test-only change to a unit-test file; `make test-integration` not needed) - not run: no integration-tested code touched

## Results

(filled in as work proceeds)
