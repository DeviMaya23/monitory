# Verification report: backend hardening

Branch: `verify/backend-hardening` (builder's branch `feat/backend-hardening`, commit `361d7ec`, plus the verifier's commit on top).

**Verdict: 1 Blocking finding (a task-file criterion that cannot hold as written; the gap is closed by a test the verifier added, the decision is the user's). No pull request opened.**

- `make check`: **run, passed** (exit 0). The first attempt failed only because `frontend/node_modules` was missing; after `npm ci` in `frontend/` it passed. Re-run of `make lint-backend test-backend` after my test additions: passed.
- Integration tests: **not run**, and none apply. `make test-integration` could not start Mailpit: port 1025 is held by another session's container (`m3-e2e-journeys-builder-mailpit-1`, left alone; I removed only the container and network my own attempt created). The only integration-tagged file in the repo is `adaptor/mailer/mailer_integration_test.go`; this task touches `memstore` and `adaptor/probe`, which have none, and no criterion depends on integration tests.
- Live run of the built app: **no**. The limiter's one caller is exercised by the M4 journey `e2e/journeys/public-rate-limit.spec.ts`, which I did not run (Mailpit port, see above).

## 1. Criteria

| # | Criterion | Test | Real? | Result |
|---|---|---|---|---|
| 1 | Existing limiter tests pass, assertions unchanged | all earlier tests in `ratelimit_test.go` (diff of that file is additions only) | Yes: the "never remove" mutation fails four of the earlier tests, "first-only" fails `ExpiredKeysAreRemovedOnTheNextCall` | Met |
| 2 | Staggered windows leave in order (3, then 2) | `TestRateLimiter_StaggeredWindowsLeaveInOrder` | Yes: fails with no removal and with first-only removal | Met |
| 3 | 1,000 keys at one instant go in one call | `TestRateLimiter_ManyKeysStartedTogetherAllGoInOneCall` | Yes: fails with first-only removal and with no removal | Met |
| 4 | Returning key gets a fresh window, one entry, counted from 1 | `TestRateLimiter_ReturningKeyGetsAFreshWindowAndOneEntry` | Yes: fails with no removal and with refusal-adds-entry | Met |
| 5 | Refused request adds no entry, does not extend the window | `TestRateLimiter_RefusedRequestAddsNoEntryAndKeepsTheWindowEnd` | Yes: fails with refusal-adds-entry and with refusal-extends-window (its `wait` assertions catch the second; the builder added them) | Met |
| 6 | Cost: 50,000-key mean < 50 × 50-key mean + 5 µs | `TestRateLimiter_CostDoesNotGrowWithLiveKeys` | Yes: fails with the full scan restored. Measured here under `-race`: 1.165 µs vs 1.101 µs. Threshold is 5.06 µs. 40 repeats at `-cpu 1,4` did not flake | Met. Comment on `time.Now` present |
| 7 | Concurrency tests pass under the race detector | `…ConcurrentRequestsOfOneKey…`, `…OfManyKeys…` | Unchanged tests; 40 repeats with `-race` passed. Not mutation-tested (the lock is untouched) | Met |
| 8 | HTTP: healthy calls use `longTimeout`, timeout calls keep 150 ms, `slow` never sends the rest | `TestCheckHTTP_JSONBodyReadInsideTimeout` | **Only through an assertion the task did not list.** See N1: with the task's assertions alone, reading the body without rules still gives a healthy verdict. The builder's added elapsed check (`< longTimeout`) is what fails the mutation | Met, with a correction to the task file's reasoning |
| 9 | No other test in `http_test.go` changes (`TestTestHTTP_StalledBodyWithoutRules` untouched) | diff | n/a | Met: the diff has one hunk in this test and one helper |
| 10 | TCP: two-sided bound `begin+50ms <= deadline <= end+50ms` | `TestCheckTCP_Timeout` | Lower bound: yes (1 ms mutation fails). **Upper bound: no.** A 5 s timeout passes (see B1) | **Partly met** |
| 11 | 5 s TCP timeout fails the upper bound; 1 ms fails the lower | `TestCheckTCP_Timeout` | 1 ms: fails. 5 s: **passes** as built | **Not met** as built (B1). Met after the verifier's added bound |
| 12 | `make check` passes | — | — | Met |
| 13 | Nothing outside the four files changed; `go.mod`, `go.sum` unchanged | `git diff origin/main...HEAD --stat` (five files: the four plus the plan) | — | Met |

## 2. Plan check

Read after the criteria. Every criterion of the task file appears in the plan. Every ticked item names a test that exists and checks the behaviour, with these notes:

- The plan's "mutation checks run" matches mine, except that its 5 s TCP mutation is reported as "does not fail" in the judgment calls while the box under "TCP probe test" is ticked. The plan is honest about the gap; the tick is not.
- The plan's added assertion in the HTTP test and the added `wait` assertions in the refused-request test are real differences from the task file. Both are justified, and I reproduced both reasons.
- Plan versus diff: no other difference. The plan says "only the four files plus the plan", and the diff agrees.
- Cost means in the plan (49 ns vs 65 ns plain; 1.781 µs both under `-race`) are the builder's own; mine are above.

## 3. Rule checks

- **Dependencies:** `go.mod` and `go.sum` unchanged; the `go` line is unchanged. The only new imports are the standard library's `math/rand/v2` in my test. Pinned versions untouched.
- **Cost rule (`ratelimit.go`):** `expire` loops from the head and stops at the first running window; neither `Allow` nor `expire` visits live windows. The lock is held for the whole of `Allow` (`defer l.mu.Unlock()`).
- **Behaviour by reading:** the refused path returns before touching the queue or the map. A returned key is removed in `expire` before it is looked up, so it leaves no stale entry. `Len()` is `len(windows)`. Limit 0 would append queue entries without map entries, but `config.go:222` enforces a minimum of 1, so it cannot happen.
- **Time:** `ratelimit.go` uses only `clock.Clock`. New `time.Now` calls: cost test (commented), TCP test (replacement plus the `end` read), and — **not listed in the task** — the HTTP test's elapsed check (`begin := time.Now()`, `time.Since`). Adaptor tests may use real deadlines (`TESTING.md`), so this is not a convention break; see N1.
- **Tests not weakened:** `http_test.go` has no assertion removed or loosened. The TCP assertion lost something: see B1.
- **CONVENTIONS.md:** rule 12 (counters never stored): in memory only. Rule 15 (fixed window, `Retry-After` from the time left): unchanged arithmetic. No `nolint`, no goroutine, no new exported name. Layer boundaries and data scoping: not touched by this diff.
- **Frontend rules:** not applicable.

## 4. Mutation checks run

| Mutation | Test that failed |
|---|---|
| Restore the full scan in `Allow` | `…CostDoesNotGrowWithLiveKeys` (took 288 s under `-race`, as the task warned) |
| Never remove ended windows | `WindowEndsAtExactlyItsLength`, `RefusedRequestDoesNotExtendTheWindow`, `WindowStartsAtTheFirstRequest…`, `ExpiredKeysAreRemoved…`, `StaggeredWindowsLeaveInOrder`, `ManyKeysStarted…`, `ReturningKey…`, `RefusedRequestAddsNoEntry…` |
| Remove only the first ended window per call | `ExpiredKeysAreRemoved…`, `StaggeredWindowsLeaveInOrder`, `ManyKeysStarted…` |
| A refused request adds an entry | `KeysAreExactStrings…`, `ConcurrentRequestsOfManyKeys…`, `ReturningKey…`, `RefusedRequestAddsNoEntry…` |
| A refused request extends the window | `WaitIsTheTimeLeft…`, `WindowEndsAtExactlyItsLength`, `KeysAreIndependent`, `RefusedRequestAddsNoEntry…` |
| Compaction copies from `head+1` | `…MatchesAPlainModelOverRandomCalls` (mine) |
| Compaction forgets to reset `head` | `…MatchesAPlainModelOverRandomCalls` (mine) |
| Probe reads the body without rules | `TestCheckHTTP_JSONBodyReadInsideTimeout/slow_2xx…` — **only the builder's added elapsed assertion** (2.001 s is not less than 2 s) |
| TCP timeout 1 ms | `TestCheckTCP_Timeout` lower bound |
| TCP timeout 5 s | **Passed as built** (B1). Fails with the verifier's added bound |

## 5. Tests added by the verifier (existing files, no new file)

- `ratelimit_test.go`: `TestRateLimiter_KeyReturnsAtTheInstantAnotherKeyExpires` (two keys end at one instant while one of them returns, and one step before and at the next end), and `TestRateLimiter_MatchesAPlainModelOverRandomCalls` (60,000 seeded random calls over 4,000 keys against the plain scan, comparing `allowed`, `wait` and `Len()` on every call; it reaches the queue's compaction branch). Limit of 1 is covered by the existing `LimitOneRefusesTheSecondRequest`.
- `tcp_test.go`: in `TestCheckTCP_Timeout`, the dialer stub records `time.Now()` and the test asserts `deadline <= dialedAt + 50ms`. The deadline exists before the dialer runs, so this holds however late the test runs (30 repeats with `-race` passed), and a 5 s timeout fails it.

## 6. Findings

### Blocking

**B1. The TCP deadline test no longer catches a timeout that is too long.** Requirement FR-41 (the timeout covers the lookup and the connect); acceptance criterion "A mutation that makes the probe use a 5 s timeout fails the upper bound".
- Reproduce: in `tcp.go` change `context.WithTimeout(ctx, check.Timeout)` to `context.WithTimeout(ctx, check.Timeout*100)` and run `go test -run TestCheckTCP_Timeout ./internal/adaptor/probe` at `361d7ec`. It passes (after 5 s). The stub dial blocks until the deadline, so `end` moves 5 s later and `deadline <= end + 50ms` still holds.
- Cause: the task file's bound is the wrong one. The old assertion (`WithinDuration(…, 40ms)`) did catch this mutation, so the replacement is weaker on this point, and AGENTS.md says to ask before weakening a test. The builder followed the task as written and said so in the plan.
- Status: **closed on this branch by the verifier's added bound** (section 5), which keeps the task's two bounds and adds one that does not depend on a late test. The criterion's text in the task file still cannot be met as written; that is for the user (or drafter) to correct. This is why no pull request was opened: if you accept the added bound, the PR can be opened from this branch as it stands.

### Non-blocking

**N1. The HTTP test's real-clock elapsed check was not in the task.** Category: decision needed. The task claimed a probe that read the body without rules "waits `longTimeout` and times out"; it does not. `judge` ignores a read error when there are no rules, so the verdict stays healthy and only the elapsed time shows the mutation. The builder's `assert.Less(time.Since(begin), longTimeout)` is the only thing that fails it. It cannot add a flake: the same call already fails at 2 s through its own timeout. Matters when: someone removes it as "not in the task". Keep it.

**N2. The limiter's backing slice keeps its capacity after a burst.** Category: latent bug. `started[:0]` keeps the array, and compaction only runs while a tail is live. Matters when: a single window sees on the order of a million distinct addresses (about 40 MB held until restart). The task already accepts the map's unbounded size, and Go does not shrink the map either. Report only.

**N3. The cost test is timed on a wall clock.** Category: test quality. Approved in the task. Matters when: a runner stalls for hundreds of µs only during the 50,000-key measurement. The margin is 5 µs plus 50× against a measured ratio of about 1×; it did not flake in 40 repeats at `-cpu 1` and `-cpu 4`.

## 7. Docs or specs that no longer match

- `docs/tasks/backend-hardening.md`: the criterion "a mutation that makes the probe use a 5 s timeout fails the upper bound" is false for the bound it prescribes (B1), and the line "a probe that read the body without rules … waits `longTimeout` and reports a timeout" (the "Trade-off" paragraph, and the Acceptance criteria) is false; the verdict is healthy and only elapsed time shows it (N1).
- `docs/tasks/backlog.md`: nothing to remove. The limiter and the two probe-test lines are no longer there; the `TestTestHTTP_StalledBodyWithoutRules` line stays as the task says.
- `docs/openapi.yaml`, `docs/requirements.md`, `STACK.md`: no change. No dependency was added or moved; no version to record.
