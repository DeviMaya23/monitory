# Verification report: target dialog test flake

Branch: `verify/target-dialog-test-flake` (reset onto the builder's `feat/target-dialog-test-flake` at `900594a`, plus this report).

Verdict: **no Blocking findings.** `make check` passes (exit 0, lint, 911 frontend tests, builds). The diff is `TargetDialog.test.tsx` and the plan file only.

## Criteria

| # | Criterion | Test | Real? | Status | Evidence |
|---|---|---|---|---|---|
| 1 | Reproduce on the default version; whole suite x3, noted in the plan | none (a procedure) | n/a | Met (not re-run by me) | Plan records 4259 ms for the old case and a 5000 ms timeout in all three suite runs. I did not re-run the old version. |
| 2 | Each new case under 1000 ms in a single-file verbose run | both new cases | n/a | **Partly met** | Mine: behavior 606, 629, 1103, 1112 ms; no-limit 657, 662, 1363, 1566 ms. The 600-660 ms runs were at load average ~20; the 1.1-1.6 s runs at load ~35 (a shared machine). Plan says 781 and 822 ms. Under 2000 ms in every run, so the "stop and report" line was never reached. The margin to the 5000 ms limit is at least 3x. |
| 3 | Whole suite x3 with no timeout in this file | n/a | n/a | Met | `make test-frontend` x3: 911 passed each, 0 timeouts, 71.8 s, 66.0 s, 71.5 s. `make check` ran it a fourth time with 911 passed. |
| 4 | By reading: old title gone, two cases, every old assertion in one case unchanged, no timeout, third `it` argument, fake timers or sleep | diff | n/a | Met | Old title gone. Both titles end `(FR-92)`. Line-by-line comparison below. `git diff` adds no `timeout`, `useFakeTimers` or sleep. |
| 5a | Behavior case fails if focus on a new row's name goes | `adds a header row and focuses its name; … (FR-92)` | **Weak** | Met, with a caveat | Breaking `NameValueRows` add-focus alone: test still passes. See finding N1. Breaking it together with `append`'s default `shouldFocus` makes it fail. |
| 5b | Behavior case: numbering (`Header N name`), renumber, focus after removing row 2 | same | Real | Met | Mutation (d) below: it fails when focus after removal is broken. Numbering is by label lookup of `Header 2 name` and `Header 3 name`. |
| 5c | Behavior case: order of the sent headers | same | Real | Met | Mutation (c) fails it. |
| 6 | No-limit case fails if the dialog stops adding at 20 | `adds 21 header rows … no limit (FR-92)` | Real | Met | Mutation (a) fails it. |
| 7 | `make check` passes | n/a | n/a | Met | Exit 0. |
| 8 | Nothing outside the allowed path changed | n/a | n/a | Met | `git diff origin/main...HEAD --name-only` lists the test file and the plan only. |

**Old against new, line by line.** The old case's assertions: URL typed; focus on `Header 1 name` after the first add; type A, B, two, C; 21 `Remove header` buttons; removal of rows 21 to 4; after removing row 2, `Header 3 name` gone, `Header 2 name` = `C` with focus; one more add; `createTarget` called with `{A,''},{C,''},{'',''}`.
- Behavior case keeps all of those except the 21-button count and the 21-to-4 removal loop.
- No-limit case has the 21-button count and `Header 21 name` (new, the task asks for it).
- The 21-to-4 removal loop is gone, which the task declares as a known gap.
- No other expectation was weakened.

**Independence.** The cases share no state. `--sequence.shuffle` with seeds 1 and 7 gave 97 passed each time, and the no-limit case passes alone with `-t`.

## Plan check

Source: `docs/tasks/target-dialog-test-flake.plan.md`, read after the criteria above.
- Every criterion in the task file has a plan item. None is missing.
- Every ticked item has a test or a command behind it. The tests named exist and assert what the plan says.
- Plan against diff: the diff is only the test file and the plan, as the plan says. Titles and judgment calls match the diff. The plan says it compared against `c674ff1` because local `main` had moved. That is true, and `origin/main` has the same tip.
- One difference: the plan's durations (781 and 822 ms) are lower than any of mine on a loaded machine (up to 1112 and 1566 ms). They are not contradictory, but the "under 1000 ms" box is true only on a quiet machine. See N2.
- The plan does not mention that the `Header 1 name` focus assertion survives the task's own mutation (b). See N1.

## Rule checks

- **Dependencies:** `package.json` and `package-lock.json` unchanged. `npm ci` made no change in `git status`.
- **Role and ownership:** only `frontend/src/.../TargetDialog.test.tsx` and the allowed plan file. No source, config or doc file changed.
- **CONVENTIONS and TESTING:** the cases use `user-event` and `fireEvent` as the file already did. `fireEvent` is right for the 21 clicks, because no fake timers are involved and it is a deliberate speedup. No hand-rolled widget. No design reference code copied. The file has no `_edge` or `_regress` sibling.
- **Verifier checks in the task file:** diff only in the test file (yes); no timeout added or raised anywhere (yes); expectations of the old case all present (yes, except the declared removal loop); the two cases independent (yes).

## Mutation checks run

All reverted. `git status` was clean after each.

| # | Break | Result |
|---|---|---|
| a | `NameValueRows.add` returns when `rows.length >= 20` | no-limit case **fails** (1 failed, 96 passed) |
| b | `NameValueRows.add` sets `focusAfter.current = null` | **survives** (97 passed). The task's mutation (b) does not break the case. |
| b′ | (b) plus `append(..., { shouldFocus: false })` in `TargetDialog.tsx` | behavior case **fails** |
| b″ | only `append(..., { shouldFocus: false })` | **survives** (97 passed) |
| c | `toInput` reverses the headers | behavior case **fails** (2 failed, with the neighbouring test) |
| d | `NameValueRows.remove` never sets focus | behavior case **fails**, as does the "focuses the previous row…" test |

## Findings

### Blocking

None.

### Non-blocking

**N1. The focus-on-add assertion survives the task's own mutation (b).** Category: test quality.
- `react-hook-form`'s `append` focuses the new row's first input by default, so `NameValueRows`' own `focusAfter` on add is redundant.
- The `toHaveFocus` check after the first add fails only if both are broken (b′). The old case had the same assertion and the same weakness, so the split did not cause it.
- Matters when: someone changes or removes the `focusAfter` on add in `NameValueRows` and relies on this test to catch a focus regression. `react-hook-form` would still hide it.

**N2. The "under 1000 ms" criterion depends on machine load.** Category: test quality.
- Under heavy load (load average ~35) the cases took 1.1 s and 1.4-1.6 s. The no-limit case, which does 21 adds, is the slowest.
- Matters when: CI runs on a runner that is several times slower than a quiet laptop, and the no-limit case starts to approach 5 s again. The headroom was at least 3x in my worst run.

**N3. "No limit" is proved only to 21.** Category: test quality. Report only: it is a property of absence, as the task says, and a cap above 21 (for example 25) would pass. No trigger.

### Reproduce

Not applicable, no Blocking findings. For N1: in `frontend/`, change `NameValueRows.tsx` `add` to set `focusAfter.current = null` and run `npx vitest run src/features/alert-list/components/TargetDialog.test.tsx`. All 97 tests pass.

## Integration tests

Not run, not applicable: the task touches a frontend test file only, and no integration test covers it. No criterion depends on an integration test.

## Docs or specs that no longer match

- `docs/tasks/target-dialog-test-flake.md` says "the backlog line this task replaces suggested raising the timeout", but `docs/tasks/backlog.md` has no line about this test on this branch (it has the `http-probe` flake line, not this one). Nothing to remove. The user may want to check whether the line was deleted earlier.
- `docs/openapi.yaml`, `requirements.md` and `STACK.md`: no change needed. No version or dependency was adopted.
