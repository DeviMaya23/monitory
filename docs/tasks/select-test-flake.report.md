# Verifier report: select test flake

Branch: `verify/select-test-flake` (built on `feat/select-test-flake` at `9cd4c01`; this report is the only commit added).

Result: no Blocking findings. `make check` passed. Integration tests do not apply.

Process note: I opened the plan in the same step as the task file, before I had judged the criteria. The criteria table below is based on the task file and the diff. I did not use the plan's counts as evidence; every count here is from my own runs.

## Criteria

| # | Criterion | Test or evidence | Real? | Status |
|---|---|---|---|---|
| 1 | Reproduce on the default branch's version: 30 single-file runs, counts and message in the plan | Plan records 7 of 30 failing with `Unable to find an accessible element with the role "listbox"`. My mutation run (the old file) failed 9 of 30, so the reproduction is credible | Not a test; reproduction evidence | Met |
| 2 | After the change: same 30 runs have no failure; `make test-frontend` run three times has none | My runs: 0 of 30 single-file; 3 of 3 full suites passed (38 files, 584 tests each); plus 20 runs of only the changed test, 0 failed | Yes: removing the wait made 9 of 30 runs fail | Met |
| 3 | By reading: every test that reads the popup awaits `findByRole('listbox')` first in the same test | `Select.test.tsx`: "lists every option…" now awaits `findByRole('listbox')` (line 54) before `optionNames()` and `getByRole('option')`. "picks with the arrow keys and Enter" awaits it after `ArrowDown`. "renders its list inside the app-scoped portal host…" awaits it. "does not open while disabled" only asserts absence. `optionNames` and `getByRole('option')` are used only in the first test | Yes: this is the mutation below | Met |
| 4 | Assertions unchanged in meaning; no timeout, retry or sleep added; `Select.tsx`, `test/setup.ts`, other files untouched | The diff of `Select.test.tsx` is one added line. A scan of the diff for `setTimeout`, `timeout` and `useFakeTimers` matches only plan text ("no timeout, retry, sleep added") | Not a test; by reading | Met |
| 5 | `make check` passes | Run by me: lint, openapi-lint, backend and frontend tests, build all passed; `git status` clean afterwards | Not a test | Met |
| 6 | Nothing outside the allowed path changed | `git diff main...HEAD --stat`: `frontend/src/components/ui/Select.test.tsx` (+1) and `docs/tasks/select-test-flake.plan.md` (the builder's own plan file, allowed) | Not a test | Met |

## Plan check

Source: `docs/tasks/select-test-flake.plan.md`.

- Every criterion in the task file has a plan item. None is missing.
- Every ticked item has evidence that exists. The test and the line the plan names are in the diff. The counts are not independently reproducible beyond what I re-ran: my 0 of 30 after and 3 of 3 full suites match the plan. The "before" count of 7 of 30 is the builder's; my mutated run (9 of 30) is consistent with it.
- The plan says the arrow-key test passed in 60 runs and was left unchanged. That matches the task file ("Known gaps"). I did not run it separately 30 times; it was part of every file run (0 failures in my 30 fixed runs and 3 suites).
- The plan and the diff agree: the wait is inline and `optionNames` stays synchronous, which the task allowed.

## Rule checks

- Dependencies: `package.json` and the lockfile are not in the diff. No dependency added or version changed (ROLES.md, STACK.md).
- Ownership (ROLES.md, Frontend): only `Select.test.tsx` and the builder's plan file changed.
- Test files (TESTING.md): the change is in the existing colocated test file; no `_edge` or `_regress` file.
- CONVENTIONS.md layer, data-scoping and transaction rules: not applicable, since there is no backend or source change.
- Frontend checks: no hand-written widget in the diff; the test uses the `components/ui/Select` wrapper. No design reference code copied.
- Task "Verifier checks", by reading: diff only in `Select.test.tsx`; no `setTimeout`, raised `waitFor` timeout, `useFakeTimers` or `{ timeout: … }`; expectations as before; each popup read is behind an awaited `findByRole`. All hold.

## Mutation checks run

| Mutation | Command | Result |
|---|---|---|
| Delete `await screen.findByRole('listbox')` from "lists every option…" (the original file) and run 30 times | `npx vitest run src/components/ui/Select.test.tsx` in a loop | 9 of 30 runs failed. The check shows the wait is what makes the test reliable. File restored with `git checkout`; `git status` clean |

No requirement IDs or security rules apply to this task, so this is the only mutation that matters.

## Extra attempts to break it

- `Select.test.tsx` with `--pool=threads`, filtered to "lists every option", run 20 times: 0 failed.
- Boundaries and malformed input do not exist for this change. Concurrent writes do not apply. The risk to look for is a read that happens after the listbox appears but before its options are ready. No such failure appeared in 30 + 20 + 3 suite runs.

## Integration tests

Not run, and none apply: the task touches only a frontend test file. No Go code or integration-tagged test is affected, and no criterion depends on one.

## Findings

### Blocking

None.

### Non-blocking

1. **Test quality: the arrow-key test is not shown to be stable by a dedicated 30-run check.** It sits in the same file as the 30 clean runs, so those runs cover it. Matters when: the backlog line for it still shows a failure in CI after this merges (then the cause is the keys sent before an item is highlighted, outside this task).
2. **Test quality: `findByRole('listbox')` resolves when the popup appears, not when every option is rendered.** The test then reads options synchronously. No failure in my runs. Matters when: a Base UI upgrade renders the list and its items in separate steps and `optionNames()` returns an empty or short list.

## Docs or specs that no longer match

None. `docs/openapi.yaml`, `docs/requirements.md` and `STACK.md` are unaffected. No dependency or version was adopted (Vitest stays as `STACK.md` names it; the run used Vitest v5.1.0 from the existing lockfile).

The flaky-test line for `Select.test.tsx` in `docs/tasks/backlog.md`, if the drafter keeps one, can be closed once this merges; I found none to point at under "select" or "flak" for this test (the only match is the unrelated `http-probe` line).
