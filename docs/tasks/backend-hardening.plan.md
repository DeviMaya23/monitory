# Plan: backend hardening

Branch: feat/backend-hardening

## Rate limiter (`backend/internal/memstore/ratelimit.go`, tests in `ratelimit_test.go`)

Approach: keep the map (key -> count, end) and add a FIFO slice-queue of (key, end) in start order; `Allow` pops ended entries from the front and stops at the first live one. Refused requests touch nothing.

- [ ] Existing tests still pass unchanged — `ratelimit_test.go` (all current tests)
- [ ] Staggered windows leave in order — `TestRateLimiter_StaggeredWindowsLeaveInOrder`
- [ ] 1,000 keys at one instant go in one call — `TestRateLimiter_ManyKeysStartedTogetherAllGoInOneCall`
- [ ] Expired key that asks again gets one fresh entry and is counted from 1 — `TestRateLimiter_ReturningKeyGetsAFreshWindowAndOneEntry`
- [ ] Refused request adds no entry and does not extend the window — `TestRateLimiter_RefusedRequestAddsNoEntryAndKeepsTheWindowEnd`
- [ ] Cost: 50 vs 50,000 live keys, mean of 2,000 calls, best of 5, 50,000-key mean < 50 × 50-key mean + 5 µs — `TestRateLimiter_CostDoesNotGrowWithLiveKeys`
- [ ] Concurrency tests pass under the race detector — existing two concurrent tests, via `make check`

## Probe test (`backend/internal/adaptor/probe/http_test.go`)

- [ ] `slow` never sends the rest of the body (waits on `r.Context().Done()`); healthy call uses `longTimeout`, timeout calls stay at 150 ms — `TestCheckHTTP_JSONBodyReadInsideTimeout`
- [ ] No other test in the file changes

## TCP probe test (`backend/internal/adaptor/probe/tcp_test.go`)

- [ ] Two-sided bound `begin+50ms <= deadline <= end+50ms` — `TestCheckTCP_Timeout`

## Repo-wide

- [ ] `make check` passes — outcome:
- [ ] Only the four allowed files (plus this plan) changed; `go.mod`/`go.sum` unchanged
- [ ] Integration tests — not run: no integration-tagged code touched (memstore and probe tests carry no `integration` tag)
- [ ] Mutation checks run locally (full scan; no removal; first-only removal; refused adds entry; TCP 5 s / 1 ms; read body without rules)

## Cost test measured means

(filled at the end)

## Judgment calls

(filled at the end)
