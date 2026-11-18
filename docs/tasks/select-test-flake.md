# Task: select test flake

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

`components/ui/Select.test.tsx` fails on CI and locally for no change of code: the test "lists every option when opened, and picking one calls onValueChange with its value" reads the list of options right after the click on the trigger, before Base UI has rendered the popup, and fails with `Unable to find an accessible element with the role "listbox"`. The `portal-into-app` builder saw it fail in about half of single-file runs (its plan and report), and the fix round of `target-delivery-notice` recorded it failing in two of three local runs and once in the pull request CI of an unrelated branch. (A different failure, a timeout of a `Select.test.tsx` case in one `make check` run of `m1-e2e-journeys`, is not this one and is not covered here.) This task makes the test wait for the popup before it reads it, so that the suite is reliable. No behavior of the app changes.

Requirements covered: none. This is a test-reliability fix (`TESTING.md`). Its criteria prove the test no longer reads the popup early.

Out of scope:

- `components/ui/Select.tsx` and any other component: the cause is the test's early read, not the component. If the test still fails after it waits (see "Stop and ask when"), the cause is elsewhere and this task stops.
- Raising a timeout, a retry count, a `waitFor` timeout or the testing-library configuration (`test/setup.ts`), and any `setTimeout` or sleep: those hide the cause.
- The other known flaky case, `TargetDialog.test.tsx` "adds a header row… (FR-92)" (its own backlog line), and every other test file. `AddServiceForm.test.tsx` already waits for the list with `findByRole('listbox')`.

## Prerequisite

None. The builder checks first that `frontend/src/components/ui/Select.test.tsx` exists with the test named above.

## Role and ownership

Role: Frontend.

You may change `frontend/src/components/ui/Select.test.tsx` only. You may not change `frontend/src/components/ui/Select.tsx` or any other file under `frontend/src/`, `frontend/package.json`, `frontend/package-lock.json`, the lint and build configuration under `frontend/`, `backend/**`, or `docs/**` (except your own plan file, `docs/tasks/select-test-flake.plan.md`).

Shared files this task touches: none besides `Select.test.tsx`, which it owns. Tasks that may run at the same time: any backend task (`webhook-sender`, `delivery-retry`, and the ones after them); no other frontend task is open.

## Operations used

None.

## Behavior

### What exists

`Select.test.tsx` has a helper `optionNames` that calls `screen.getByRole('listbox')` at once and lists the text of its options. The test "lists every option when opened, and picking one calls onValueChange with its value" clicks the trigger and then calls `optionNames()` and `getByRole('option', …)` with no wait. Other tests in the file already wait: "picks with the arrow keys and Enter" awaits `screen.findByRole('listbox')` after `ArrowDown`, and "renders its list inside the app-scoped portal host" awaits it after the click. The backlog also listed the arrow-key test as flaky. It has no early read to fix; the builder checks by repeated runs whether it still fails (see the criteria) and, if it does, stops and reports (the cause would be elsewhere, for example the keys sent before an item is highlighted), without changing it.

### The change

In the test above, wait for the popup before any read of it: await `screen.findByRole('listbox')` (default timeout) after the click and before `optionNames()` and the `getByRole('option', …)` queries. The helper `optionNames` may become asynchronous and wait itself, or stay synchronous and be called only after the wait; either way no test in the file reads the listbox, an option or `optionNames()` before awaiting the listbox in the same test. A negative assertion that nothing is open (`queryByRole('listbox')` in "does not open while disabled") has nothing to wait for and stays as it is. Nothing else in the file changes: the expectations (the three options in order, `Alpha` selected, `onValueChange` called once with `c`, the trigger showing `Gamma` after) stay as they are.

### Known gaps

- **jsdom timing is not removed,** only waited for: a wait with the default one-second timeout is the standard way to read an asynchronously rendered popup (`findBy*`), and the other tests already use it.
- **The arrow-key test** is not changed by this task. If repeated runs show it failing, that is reported, not fixed here.

## Structure

One test file. No new helper outside the file.

## Design reference

None.

## Dependencies

None. `package.json` and the lockfile do not change.

## Acceptance criteria

- Reproduce first, on the default branch's version of the file: run `Select.test.tsx` alone 30 times (for example a shell loop around `npx vitest run src/components/ui/Select.test.tsx` from `frontend/`) and note how many runs fail and with which message, in the plan. If it cannot be reproduced in 30 runs, say so; the fix still applies (the read is early by reading), and the next criterion is checked the same way.
- After the change, the same 30 runs have no failure, and so does the whole frontend suite (`make test-frontend`) run three times. The counts are in the plan and the report.
- By reading: in `Select.test.tsx`, every test that reads the popup (`getByRole('listbox')`, `getByRole('option', …)`, `getAllByRole('option')`, `optionNames()`) awaits `findByRole('listbox')` (or a `findBy` for the option) earlier in the same test. The test "lists every option…" has the wait; if the arrow-key test failed in the repeated runs, its read is waited the same way.
- The assertions of every test are unchanged in meaning: the same expectations, none removed or weakened, no timeout, retry or sleep added, `Select.tsx`, `test/setup.ts` and other files untouched.
- `make check` passes.
- Nothing outside the allowed path changed.

## Verifier checks

- **By reading:** the diff is only in `Select.test.tsx`; no `setTimeout`, `waitFor` with a raised timeout, `vi.useFakeTimers` or `{ timeout: … }` was added; the expectations are as before; each popup read is behind an awaited `findByRole`.
- **Run it:** the single-file test 30 times and the whole suite three times, and report the failure counts (the verifier has no browser; this is the evidence).
- **Mutation check:** put a synchronous `getByRole('listbox')` back right after the click in "lists every option…" and run the file about 30 times; the test should fail in at least one run (a flaky test cannot be shown to fail in every run, so say how many failed). If none of the 30 mutated runs fails, say so in the report: the check then proves nothing, the "by reading" check stands, and that is not a failure of the task. Restore the file after.

## Stop and ask when

- The test still fails in the repeated runs after it waits for the listbox, or the options or the click on `Gamma` are not ready right after the listbox is found: then the cause is in the component or in Base UI's timing. Stop and report the failing runs and messages; do not add sleeps, raise timeouts or change `Select.tsx`.
- You think you need a change outside `Select.test.tsx`, a dependency, or an edit to a spec file.
- A convention in `CONVENTIONS.md` or `TESTING.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, the failure counts before and after, dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
