# Task: backend hardening

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

Three loose ends in the backend are closed, with no change in product behavior:

1. The public view's rate limiter no longer scans every live address on every request; its per-call cost depends on the entries that expire, not on the entries that live.
2. One probe test, whose "healthy" assertion had to finish inside a real 150 ms deadline, no longer fails on a slow runner.
3. The TCP probe test that compared a recorded deadline to the clock within 40 ms no longer depends on how late the test runs.

Requirements covered (behavior unchanged, protected by the tests below):

- FR-32: at most the configured number of requests per client address per fixed window; the refusal says how long to wait. The counters are not stored (`CONVENTIONS.md`, rule 12).
- FR-41, FR-73: the timeout covers reading the body when JSON rules exist; a check without rules does not read the body.

Out of scope:

- Any change to a non-test file other than `memstore/ratelimit.go`. The probes (`adaptor/probe/*.go` apart from tests) and the usecase do not change.
- The session store's own sweep of expired sessions (`memstore/sessions.go`). A session needs the correct password and the count is small; no trigger has happened.
- The public view's response, headers, `Retry-After` arithmetic and window rule. They do not change.
- `TestTestHTTP_StalledBodyWithoutRules`. It waits out its timeout by design, so a long timeout would make it slow and `TESTING.md` caps an exercised timeout at 200 ms. The user decided to leave it at 150 ms; a narrower line stays in the backlog. The routes with a 150 ms `Delay` elsewhere in `http_test.go` are within that cap and are not touched.
- The frontend suite (`frontend-hardening`) and the end-to-end suite (`m5-e2e-journeys`, not drafted yet).
- Any contract, configuration, migration or documentation change.

## Prerequisite

All merged on the default branch (they are today). The builder checks the names and stops to ask if one is missing:

- `memstore.RateLimiter` (`NewRateLimiter`, `Allow`, `Len`) in `backend/internal/memstore/ratelimit.go`, and `ratelimit_test.go` in the package `memstore_test`.
- `TestCheckHTTP_JSONBodyReadInsideTimeout` in `backend/internal/adaptor/probe/http_test.go`, with the helpers `rawServer`, `get`, `run`, `requireFailed`, `requireHealthy` and the constant `longTimeout` (2 s).
- The test with `assert.WithinDuration(..., 40*time.Millisecond)` in `backend/internal/adaptor/probe/tcp_test.go` (around line 219).

## Role and ownership

Role: Backend.

You may change only `backend/internal/memstore/ratelimit.go`, `backend/internal/memstore/ratelimit_test.go`, `backend/internal/adaptor/probe/http_test.go` and `backend/internal/adaptor/probe/tcp_test.go`. You may not change any other file under `backend/` (migrations, generated code, `go.mod`, `go.sum`, the rest of `memstore/`, the probes' non-test code), `frontend/**`, `e2e/**`, `docs/**` (except your own plan file, `docs/tasks/backend-hardening.plan.md`), `.env.example` or the `Makefile`.

Shared files: none. No file here is touched by another task.

Tasks that may run at the same time: `frontend-hardening` (frontend only) and `m5-security-journeys` (`e2e/**` only; planned, not drafted when this file was written). Neither touches a file here. The M4 end-to-end journey for the public rate limit (`e2e/journeys/public-rate-limit.spec.ts`) exercises the limiter through the real binary; this task does not change it. No other backend task runs beside this one.

## Operations used

None. `getPublicDashboard` is behind the limiter and does not change.

## Behavior

### 1. The rate limiter's cost

What exists: `RateLimiter.Allow(key)` takes the lock, removes every key whose window has ended by scanning the whole map, then counts the request. The scan makes each call cost as much as the number of live addresses, under the one lock.

Behavior that must stay exactly as it is (the existing tests are the specification):

- A window starts at the first request of a key that has no running window and ends one window length later; it is never extended, by an allowed or a refused request.
- Inside it, requests up to the limit are allowed; the others are refused, are not counted, and `wait` is the time left in the window; when allowed, `wait` is 0.
- At exactly the end of the window the key's window is over (`!now.Before(end)`), and the request starts a new one.
- Every call first removes the keys whose window has ended, so `Len()` right after a call counts only keys with a running window. A key whose window ended is removed even when the call is for another key.
- Keys are exact strings, counted independently; the limiter is empty at every start (`CONVENTIONS.md`, rule 12) and safe for concurrent use.

What changes: the removal of ended windows must cost time proportional to the number of windows that ended (amortized), not to the number of live windows. A call that finds no ended window must not visit the live ones. Every window has the same length and starts when its key first appears, so windows end in the order they started: keep them in start order and take ended ones from the front. The builder may use another structure that meets the cost rule. The one lock stays.

Nothing else about the limiter's API changes: the constructor, `Allow` and `Len` keep their signatures.

### 2. The 150 ms probe test with a healthy call

The user decided: **split the timeouts** in `TestCheckHTTP_JSONBodyReadInsideTimeout`. A call that expects a timeout may keep 150 ms, because a later timeout is still a timeout. A call that expects a healthy result must not depend on 150 ms.

- The helper `slow(status)` sends the headers and the start of a body at once and then, after three timeouts, the rest. Change it so the rest is never sent: it waits until the request ends (`r.Context().Done()`), as `stalledBody` does. Nothing after the timeout reads that rest.
- The subtest `slow 2xx body times out with rules, healthy without`: the call with rules stays at the 150 ms timeout and still expects `FailureTimedOut`. The call without rules, which expects healthy, uses `longTimeout`. With the body never finishing, a probe that read the body without rules would wait for `longTimeout` and report a timeout, so the assertion still proves that a check without rules does not read the body.
- The subtest `slow 500 body times out` stays at 150 ms.
- The other subtests (cut-off bodies, caller cancelled) are not changed.
- Trade-off: with a body that never finishes, a prober that wrongly read past the deadline would hang the test until `go test`'s own limit instead of failing quickly. The old helper's late rest made such a bug a fast wrong verdict. The change is still needed: with the old `slow`, the no-rules call at `longTimeout` would get the whole body after 450 ms and report healthy, so a prober that read the body without rules would go unnoticed.

### 3. The 40 ms assertion in `tcp_test.go`

The test records the context deadline the dialer is given and compares it with `begin.Add(50 * time.Millisecond)` within 40 ms. Replace it with a bound that depends on no delay: `begin.Add(50ms) <= deadline <= end.Add(50ms)`, where `begin` is read just before `CheckTCP` and `end` just after it returns. (The deadline is made during the call, so it cannot be before `begin + 50ms` or after `end + 50ms`.) No other line of the test changes.

### Known gaps

- **The cost test is a wall-clock comparison.** It cannot be a fake-clock test, because what it measures is CPU work. It compares two sizes with a wide margin, so a slow runner does not change the verdict. `TESTING.md` says memstore tests use the fake clock and do not wait on real timers; reading `time.Now` to measure work is not waiting, but it is a judgment call that the user approves by approving this task.
- **A backward step of the wall clock** (`clock.Real.Now()` drops the monotonic reading) can break the start order the queue relies on: an ended window behind a live one would stay until the one in front ends, at most one window, and be refused with a wait of 1 second at most in the meantime. The user accepted this. No extra code.
- **The limiter's memory is unbounded** by the number of distinct addresses in one window. The backlog line was about the per-call scan; the map's size was accepted by `public-dashboard-api`.
- **`TestTestHTTP_StalledBodyWithoutRules` keeps its 150 ms deadline** and can still fail on a very slow runner. It stays in the backlog.

## Structure

By `ARCHITECTURE.md`. No new file, and no new exported name. Unexported helpers and fields are the builder's choice.

## Dependencies

None. Standard library only; `go.mod` and `go.sum` do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Limiter tests use `clock.Fake`.

**Rate limiter (`memstore/ratelimit_test.go`)**

- Every existing test of the file still passes with no change in what it asserts.
- Staggered windows leave in order: with `testWindow` of one minute, key `a` at T, key `b` at T + 30 s, key `c` at T + 30 s; at T + 60 s a call for key `d` leaves `Len()` at 3 (`b`, `c`, `d`); at T + 90 s a call for `e` leaves 2 (`d`, `e`).
- Many keys that started at one instant all go in one call: 1,000 keys at T, at T + one minute a call for another key leaves `Len()` at 1.
- A key whose window ended and that asks again gets a fresh window and one entry: after its window ended, two calls leave `Len()` at 1 and the key is counted from 1 again (the limit is reached after `testLimit` new requests, not fewer).
- A refused request adds no entry and does not extend the window: a key reaches its limit at T and is refused at T + 10 s, 20 s, 30 s, 40 s and 50 s, with `Len()` at 1 after each; at T + 1 minute a call for another key leaves `Len()` at 1 (the refused key's window ended at its original time; a refusal that extended the window or left an entry would leave 2).
- Cost: with limit 1,000,000 so every call is allowed, and the fake clock never advanced, build one limiter holding 50 distinct live keys and another holding 50,000 (each built once, filled before measuring), and measure the mean time of 2,000 `Allow` calls on one of its keys, one limiter after the other; each measurement is the lowest of five repeats. The 50,000-key mean must be below 50 times the 50-key mean plus 5 µs. (A scan of every live key makes it thousands of times larger; a slow runner scales both sides.) The measurement uses `time.Now`; a comment in the test says that it measures work, not waiting, and that the task's approval by the user is what allows it.
- The concurrency tests of the file still pass under the race detector.

**Probe test (`adaptor/probe/http_test.go`)**

- `TestCheckHTTP_JSONBodyReadInsideTimeout`: the calls that expect healthy use `longTimeout`, the calls that expect a timeout keep 150 ms, and the helper `slow` never sends the rest of the body. A mutation that makes the prober read the body when no rules exist fails the "healthy without rules" assertion (it waits `longTimeout` and times out).
- No other test in the file changes in any way; in particular `TestTestHTTP_StalledBodyWithoutRules` is untouched.

**TCP probe test (`adaptor/probe/tcp_test.go`)**

- The deadline assertion is the two-sided bound `begin + 50ms <= deadline <= end + 50ms`. The lower bound is exact (it had slack of 40 ms before); the upper bound is looser than the old 90 ms ceiling in a quick run, because the call itself lasts about 50 ms, but it cannot fail on a late test. A mutation that makes the probe use a 5 s timeout fails the upper bound; one that uses 1 ms fails the lower bound.

**Repo-wide**

- `make check` passes.
- Nothing outside the four allowed files changed; `go.mod` and `go.sum` are unchanged.

## Verifier checks

- **Cost rule, by reading `ratelimit.go`:** no loop in `Allow` or in the removal visits the live windows; the removal takes ended windows from the front of an ordered structure and stops at the first live one; the lock is held for the whole of `Allow` as before.
- **Behavior, by reading:** a refused request does not touch the structure; a key whose window ended is removed before it is counted again, so no stale entry remains; `Len()` is the number of keys with a running window.
- **Time:** the limiter's code uses only `clock.Clock`; the only new `time.Now` calls in the diff are in the cost test (with its comment) and, as a replacement of the existing one, in the TCP test.
- **Tests were not weakened:** the diff of `http_test.go` shows no assertion removed or loosened (the `slow` helper and the timeouts of the healthy calls change); the TCP assertion's lower bound is tighter and its upper bound is looser than before, and cannot fail on a late test.
- **Mutation checks to run:** restore the full scan in `Allow` (the cost test must fail); never remove ended windows (the ordering tests and the existing removal test must fail); remove only the first ended window per call (the many-keys test must fail); let a refused request add an entry (the refused-request test must fail); make the prober read the body without rules (the healthy-without-rules assertion must fail; it waits `longTimeout`); use a 5 s or a 1 ms TCP timeout (the matching bound must fail). The cost-test mutation takes a long time to set up with the old scan (tens of seconds); that is expected.
- **Inputs to try:** a window that ends at the same instant for several keys; a key that expires and returns at the same instant another key expires; a limit of 1.

## Stop and ask when

- The contract, a requirement or this file conflict with each other.
- You think you need a change outside the four files, a dependency, a migration or a config key.
- A convention in `CONVENTIONS.md` or `TESTING.md` seems to prevent what this file asks for (the cost test's wall-clock measurement included).
- The cost test is flaky on your machine: report the numbers and stop; do not raise the margin without asking.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), the cost test's measured means (50 and 50,000 keys), that no integration tests apply, that no dependency changed, and anything you were unsure about. Also list every judgment call this file did not settle.
