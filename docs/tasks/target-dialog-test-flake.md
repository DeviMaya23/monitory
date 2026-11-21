# Task: target dialog test flake

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

`features/alert-list/components/TargetDialog.test.tsx` has one test that times out at the default 5000 ms in a loaded run with no change of code: "adds a header row and focuses its name; names the inputs by number; renumbers and moves focus on removal; sends rows in order, empty ones too; has no limit (FR-92)". It does about 60 sequential `userEvent` calls in one case (it adds 21 header rows, types in three, removes 18, then saves), and takes about 1.9 s on a quiet machine, so a loaded CI run or a full parallel run can pass the limit. The cause is the length of the case, not a missing wait. After this task the same assertions run in two shorter cases, each far inside the limit, with no timeout raised.

Requirements covered: none. This is a test-reliability fix (`TESTING.md`). It keeps the proof of FR-92 (header rows, in order, empty ones too, no limit) the case gave.

Out of scope:

- **`components/NameValueRows.tsx`, `TargetDialog.tsx` and every other component:** the cause is the test's length. If the shorter cases still fail intermittently (see "Stop and ask when"), the cause is elsewhere and this task stops.
- **Raising a timeout** (the test's third argument, `testTimeout`, a `waitFor` timeout), a retry count, `test/setup.ts`, any `setTimeout` or sleep: those hide the cause. The backlog line this task replaces suggested raising the timeout; this file chooses to shorten the case instead.
- **Every other test in the file and every other test file.** Other tests of the file are slower than their neighbours too, but none is known to fail; they stay as they are.
- **The Select flake** (`select-test-flake`, merged).

## Prerequisite

None. The builder checks first that `frontend/src/features/alert-list/components/TargetDialog.test.tsx` has the test named above (at about line 272) and that `Select.test.tsx` is untouched by this task.

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/alert-list/components/TargetDialog.test.tsx` only. You may not change any other file under `frontend/src/` (including `TargetDialog.tsx`, `components/NameValueRows.tsx` and `test/setup.ts`), `frontend/package.json`, `frontend/package-lock.json`, the lint and build configuration under `frontend/`, `backend/**`, or `docs/**` (except your own plan file, `docs/tasks/target-dialog-test-flake.plan.md`).

Shared files this task touches: none besides `TargetDialog.test.tsx`, which it owns. Tasks that may run at the same time: any task; none other changes this file (the service-form tasks change `features/service-form/**`).

## Operations used

None. The test mocks `createTarget` and the other wrappers as the file already does.

## Behavior

### What exists

The test, in the `describe` about the header rows, opens the add dialog, chooses Webhook, types a URL, then: clicks `Add header` and expects the focus on `Header 1 name`; types `A` there; adds a second row and types `B` and `two` in it; adds a third and types `C`; adds rows 4 to 21 by clicking; expects 21 `Remove header` buttons; removes rows 21 down to 4 one by one; removes row 2 and expects `Header 3 name` gone, `Header 2 name` holding `C` and having the focus; adds one more row; submits; and expects `createTarget` called once with the headers `{ A, '' }`, `{ C, '' }`, `{ '', '' }` in that order. The next test already covers "focuses the previous row when the last row goes, and Add header when the only row goes" and stays as it is.

### The change

Split that one test into two, in the same `describe`, with titles that say what each proves (the builder's wording, each ending with `(FR-92)`):

1. **The behavior case:** the same steps with three rows only. Add row 1 and check its name input has the focus; type `A`; add row 2, type `B` in its name and `two` in its value; add row 3 and type `C` in its name; remove row 2 and check `Header 3 name` is gone, `Header 2 name` holds `C` and has the focus; add one more row; submit; and expect the same single `createTarget` call with the same three headers (`{ A, '' }`, `{ C, '' }`, `{ '', '' }`). The inputs are named by number (`Header 1 name`, `Header 1 value`, and so on) as before.
2. **The no-limit case:** open the add dialog, choose Webhook (no URL is typed; the case does not submit), click `Add header` 21 times with `fireEvent.click` (already imported in the file; no typing in the rows), and expect 21 `Remove header` buttons and `Header 21 name` present. It does not remove rows and does not submit. It asserts nothing about an error text: none can appear without a server answer.

Every assertion of the old case appears in exactly one of the two, with the same expectation; none is removed or weakened. The case may share small helpers already in the file (`shown`, `openAddDialog`, `chooseWebhook`, `submit`); a new helper inside the file is allowed if both cases use it. Nothing else in the file changes. No timeout, retry, `waitFor` option, fake timer or sleep is added.

### Known gaps

- **jsdom speed is not changed,** only the work each case does; a very slow runner could still pass a limit with enough load.
- **The removal of 18 rows in a row is no longer exercised here.** The remove-and-refocus behavior is covered with two and three rows in this file and by `NameValueRows.test.tsx`; the "no limit" claim is covered by adding 21.

## Structure

One test file. No new file.

## Design reference

None.

## Dependencies

None. `package.json` and the lockfile do not change.

## Acceptance criteria

- Reproduce first, on the default branch's version of the file: run `TargetDialog.test.tsx` with the verbose reporter (`npx vitest run src/features/alert-list/components/TargetDialog.test.tsx --reporter=verbose` from `frontend/`) and note the duration of the long test, in the plan. Then run the whole frontend suite (`make test-frontend`) three times and note whether it timed out and its duration each time. If it never fails, say so; the fix still applies (the case is long by reading) and the criteria below are checked the same way.
- After the change, each of the two new cases takes under 1000 ms in the same single-file verbose run (the durations are in the plan and the report; the old case took about 1900 ms), and the whole suite run three times has no timeout in this file. If a case takes more than 2000 ms, stop and report (see "Stop and ask when").
- By reading: the old title is gone; there are two cases; every assertion listed under "What exists" is in one of them with the same expectation; no `{ timeout: … }`, no third argument to `it`, no `vi.useFakeTimers`, no sleep.
- The behavior case would fail if the behavior were removed: the focus on a new row's name, the numbering, the renumbering and focus after removing row 2, and the order of the sent headers each have an assertion (the same ones as before). The no-limit case would fail if the dialog stopped adding at 20 (the verifier writes that change as a mutation; the component has no limit code today, so "no limit" is a property of absence).
- `make check` passes.
- Nothing outside the allowed path changed.

## Verifier checks

- **By reading:** the diff is only in `TargetDialog.test.tsx`; no timeout was added or raised anywhere; the expectations of the old case are all present, none weakened (compare the old and new cases line by line); the two cases do not depend on each other's state.
- **Run it:** the single file with the verbose reporter and report both cases' durations against the old 1.9 s; the whole suite three times, with the failure counts.
- **Mutation checks:** (a) in `NameValueRows`, stop appending a row once there are 20: the no-limit case must fail. (b) In `NameValueRows`, do not move focus to the new row's name input on add: the behavior case must fail. (c) In the dialog, send the headers in reverse order: the behavior case must fail. Restore the code after each.

## Stop and ask when

- The shorter cases still time out, fail in repeated runs, or take more than 2000 ms in a quiet single-file run: then the cause is in the component or in the test environment. Stop and report the failing runs and messages; do not add sleeps, raise timeouts or change a component.
- You think you need a change outside `TargetDialog.test.tsx`, a dependency, or an edit to a spec file.
- A convention in `CONVENTIONS.md` or `TESTING.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, the durations before and after, dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
