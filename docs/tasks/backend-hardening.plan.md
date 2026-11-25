# Plan: backend hardening

Branch: feat/backend-hardening

## Rate limiter (`backend/internal/memstore/ratelimit.go`, tests in `ratelimit_test.go`)

Approach: keep the map (key -> count, end) and add a FIFO slice-queue of (key, end) in start order; `Allow` pops ended entries from the front and stops at the first live one. Refused requests touch nothing.

- [x] Existing tests still pass unchanged — `ratelimit_test.go` (all current tests)
- [x] Staggered windows leave in order — `TestRateLimiter_StaggeredWindowsLeaveInOrder`
- [x] 1,000 keys at one instant go in one call — `TestRateLimiter_ManyKeysStartedTogetherAllGoInOneCall`
- [x] Expired key that asks again gets one fresh entry and is counted from 1 — `TestRateLimiter_ReturningKeyGetsAFreshWindowAndOneEntry`
- [x] Refused request adds no entry and does not extend the window — `TestRateLimiter_RefusedRequestAddsNoEntryAndKeepsTheWindowEnd`
- [x] Cost: 50 vs 50,000 live keys, mean of 2,000 calls, best of 5, 50,000-key mean < 50 × 50-key mean + 5 µs — `TestRateLimiter_CostDoesNotGrowWithLiveKeys`
- [x] Concurrency tests pass under the race detector — existing two concurrent tests, via `make check`

## Probe test (`backend/internal/adaptor/probe/http_test.go`)

- [x] `slow` never sends the rest of the body (waits on `r.Context().Done()`); healthy call uses `longTimeout`, timeout calls stay at 150 ms — `TestCheckHTTP_JSONBodyReadInsideTimeout`
- [x] No other test in the file changes

## TCP probe test (`backend/internal/adaptor/probe/tcp_test.go`)

- [x] Two-sided bound `begin+50ms <= deadline <= end+50ms` — `TestCheckTCP_Timeout`

## Repo-wide

- [x] `make check` passes — outcome: run, passed (exit 0; needed `npm ci` in `frontend/` first)
- [x] Only the four allowed files (plus this plan) changed; `go.mod`/`go.sum` unchanged
- [x] Integration tests (`make test-integration`) — not run: no integration-tagged code touched (memstore and probe tests carry no `integration` tag)
- [x] Mutation checks run locally (full scan; no removal; first-only removal; refused adds entry; TCP 5 s / 1 ms; read body without rules)

## Cost test measured means

Plain run (no race detector): 50 keys 49 ns, 50,000 keys 65 ns; second run 61 ns vs 51 ns. Under `-race` in `make check`-style runs: 1.781 µs vs 1.781 µs. Threshold is 50 × small + 5 µs, so far from either.

## Judgment calls

- Queue is a slice plus a head index inside `RateLimiter`; the consumed front is dropped when it empties, or compacted when the head is at least 1024 and at least half the slice. Amortized O(1), no new import.
- Cost test: the 50,000-key limiter is only measured on `key-0`, the oldest live key; 5 repeats take the lowest mean. Logs both means with `t.Logf`.
- TCP bound uses `assert.False(deadline.Before(...))` / `.After(...)` so equality passes (the criterion is `<=`).
- **Added assertion beyond the task, in `TestCheckHTTP_JSONBodyReadInsideTimeout`:** the healthy no-rules call must return in under `longTimeout`. Reason: I ran the task's mutation (read the body without rules). The verdict stays healthy, because `judge` ignores a read error when there are no rules, so the call only takes 2 s longer and the task's claimed failure ("waits `longTimeout` and times out") does not happen. With the added elapsed check the mutation fails. The bound is 2 s against a normal run of about 5 ms.
- Added `wait` assertions to the refused-request test: without them, a mutation that extends the window's end in the map is invisible, since removal is driven by the queue.
- **Task claim that does not hold, not fixed:** "a mutation that makes the probe use a 5 s timeout fails the upper bound of the TCP test". With 5 s the stub dial blocks until that deadline, so `end` moves 5 s later too, and `deadline <= end + 50ms` still holds. The test passes. A 1 ms timeout does fail the lower bound. Closing the gap needs a bound on elapsed time or the stub, which is outside what this task describes. Noting it for the verifier and the backlog.
- Mutations I ran: full scan (cost test fails, 22 s); no removal, first-only removal (ordering and many-keys tests fail); window extended on refusal (refused test fails); TCP 1 ms (fails); body read without rules (fails after my added assertion, passes without).

