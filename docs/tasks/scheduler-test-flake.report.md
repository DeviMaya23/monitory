# Verification report: scheduler test flake

Branch: `verify/scheduler-test-flake` (the session's branch, reset to `origin/feat/scheduler-test-flake` at `ffcb936`, plus this report).

Result: **no Blocking findings.** The diff is `backend/internal/worker/scheduler_test.go` plus the builder's plan. Source is untouched.

## `make check`

- `lint` (gofmt, golangci-lint "0 issues", eslint, stylelint, shellcheck): passed.
- `openapi-lint` and `build`: passed (run separately after the test step failed).
- `test-backend` (`go test -race ./...`): passed, and passed three more times on its own (0 `--- FAIL` each).
- `test-frontend`: **failed in both of my full runs** with one 5000 ms timeout in `TargetDialog.test.tsx` ("adds a header row and focuses its name…"). The file passes alone (96 of 96). The diff touches no frontend file, so I did not chase it, and I did not run it on the default branch to compare. See finding N1.

Integration tests: not run. The diff is test-only, in a unit-test file, and no integration-tested code is touched (the task file says `make test-integration` is not needed). No criterion depends only on integration tests.

## Criteria

Stress recipe: `-race` test binary built outside the repo, 8 copies at once, `--- FAIL` lines counted. "Before" is the default branch's version of the file (commit `3f05612`), built the same way.

| Criterion | Test / evidence | Real? | Verdict |
|---|---|---|---|
| Reproduce first: 8×300 for each of the three tests, 8×60 for the file | Before: Replaces 4 fails, ContextWins 17, DuringWait 4, whole file 3 (2 ContextWins, 1 DuringWait). All three reproduce. The plan's counts differ a little (4/16/6/7), which is normal for a load-dependent flake. | n/a | Met |
| After: same four runs have no failure | After: 0 / 0 / 0 / 0 | Yes: the same recipe fails on the old file, and the mutations below fail | Met |
| `make test-backend` ×3 has no failure | 3 runs, 0 failures | Yes (same reasoning) | Met |
| `countingTimer.Stop` calls the inner `Stop` first and returns the inner result | `scheduler_test.go:71-76` (`stopped := t.Timer.Stop()`, then the send, then `return stopped`); covered by `TestStop_DuringWait` | Yes: M3 reversed it and the test failed (1 of 2400 runs) | Met |
| `TestStart_ReplacesRunningService`: no `totals()` read after `Start` returns; the second sequence reads it itself; asserts 2 started, 1 ended | Test body, `c.n == 2` branch; the channel is buffered with 1 and sent to without blocking; the old `totals()` asserts are gone; `oldCancelled` is still asserted | Yes: M4 (7 of 2400 runs failed with the old read restored) and M2 (2353 of 2400 with `Start` not waiting) | Met |
| `TestScheduler_ContextWinsOverFiredTimer`: `Close` only after the hook has finished | Per-round `hookDone` (buffered 1, non-blocking send after `Advance` and `Stop`); the test waits on it with `guard` | Yes: M1 failed 2400 of 2400 runs, so the new wait does not hide the discrimination | Met |
| Assertions unchanged in meaning; no `time.Sleep`, no `guard` change, no retry; nothing else touched | Diff read: `guard` is still `5 * time.Second`, no `time.Sleep` in the file, the final assertions are all kept, and only `scheduler_test.go` and the plan changed | n/a (reading) | Met |
| `make check` passes | See above: everything passes except one unrelated frontend timeout under load | n/a | **Partly met** (not caused by this diff) |
| Nothing outside the allowed path changed | `git diff main...HEAD --stat`: the test file and `docs/tasks/scheduler-test-flake.plan.md` | n/a | Met |

## Plan check

- Every criterion is in the plan's checklist. Nothing is missing.
- Every ticked item matches the diff. The three changes exist and do what the plan says.
- Differences between the plan and what I measured:
  - The "before" counts are different (they depend on load and are not wrong).
  - The plan says `make check` passed. In my environment it failed twice on the frontend timeout.
- The plan's judgment calls (the small struct, `guard` for the waits, `t.Fatal` on a missing signal, `npm ci`) are all fine.

## Rule checks

- Dependencies: none added, and `go.mod` and `go.sum` are unchanged. No pinned version moved.
- Layer rules: the diff is a `worker/` test using only the existing in-file fakes. It adds no imports.
- Test-file rules (`TESTING.md`): no new file, and no `_edge` or `_regress` file.
- Time rules (`TESTING.md`): no real-time wait. The only `time.After(guard)` calls are guards on a signal that must come.
- Verifier checks by reading: the diff is in one file, with no sleep, no new wait on real time, and no deleted or weakened assertion. The three changes match their descriptions.
- No frontend work, so the component-library and design-copy checks do not apply.

## Mutation checks run

Each was made on a scratch change, built with `-race`, run 8 × 300 times, and then restored with `git checkout`.

| # | Mutation | Test run | Failed runs |
|---|---|---|---|
| M1 | `scheduler.go`: removed the `ctx.Err()` check at the top of the `run` loop | `TestScheduler_ContextWinsOverFiredTimer` | **2400 of 2400** |
| M2 | `scheduler.go`: `Start` no longer waits for `<-old.done` | `TestStart_ReplacesRunningService` | 2353 of 2400 |
| M3 | Test helper: `stopped` is sent before the inner `Stop` | `TestStop_DuringWait` | 1 of 2400 |
| M4 | Re-added the `totals()` read right after `Start` returns, expecting 1 and 1 | `TestStart_ReplacesRunningService` | 7 of 2400 |

M3 and M4 fail rarely, as the task file says a flaky test will. The "by reading" check stands for both.

## Inputs tried beyond the task file

- `-test.cpu 1,2,8`, the three tests, 8 × 100: 0 failures.
- Whole file under heavier load, 16 copies at once × 40: 0 failures.
- No failure appeared in any test outside the three, so no other test is reported.

## Findings

### Blocking

None.

### Non-blocking

- **N1. `TargetDialog.test.tsx` times out under load** (category: test quality).
  - It is the "adds a header row and focuses its name…" test, with the default 5000 ms timeout. In `make check` it failed twice, taking about 54 s for the file inside a 45-file parallel run. Alone it passes in 36 s for 96 tests.
  - This is not this task's change and I did not compare against the default branch.
  - Matters when: CI or a builder runs `make check` on a loaded machine and sees a red `test-frontend` with no frontend change. It would also make "make check passes" in a task file unattainable on that machine.
- **N2. The "before" failure counts are machine-dependent** (category: test quality). Report only: the plan's counts and mine differ, and no trigger makes this matter.

## Docs or specs that no longer match

None. No versions were adopted, and `docs/openapi.yaml`, `docs/requirements.md` and `STACK.md` are unaffected.
Backlog: the `scheduler` line about `Stop` followed by `Start` is unchanged and remains for `update-service-api`, as the task file says.
