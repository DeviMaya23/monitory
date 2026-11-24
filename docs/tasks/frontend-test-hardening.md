# Task: frontend test hardening

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The frontend suite is slow and, under load, flaky, with no change of code. The drafter ran `npx vitest run` on the default branch (`f10bdc4`, load average about 5 to 8 from other sessions): 1405 tests, 189 s wall time, one failure ("sends what was typed, locks the form in flight, and on the 201 goes to / with the toast and no cached list", `AddServiceForm.test.tsx`, "Test timed out in 5000ms"). The verifier reports of `service-test-panel`, `service-public-toggle` and `dashboard-public-switch` each saw one to three such timeouts in `make check` that passed alone.

Where the time is, from the same run (a test's own duration):

| File | Tests | Sum of durations | Cases over 2.5 s |
|---|---|---|---|
| `service-form/components/AddServiceForm.test.tsx` | 231 | 176 s | 24 |
| `service-form/components/ServiceForm.test.tsx` | 35 | 68 s | 10 |
| `alert-list/components/TargetDialog.test.tsx` | 97 | 67 s | 2 |
| `service-form/components/EditServiceForm.test.tsx` | 39 | 44 s | 2 |
| `service-form/components/HealthRulesGroup.test.tsx` | 10 | 7 s | 1 |
| `App.test.tsx` | 51 | 41 s | 5 |
| `service-form/components/RequestRowsGroup.test.tsx` | | | 0 (one case over 1.5 s: 21 `user.click` adds) |

Vitest runs the tests of one file one after another, so `AddServiceForm.test.tsx` alone sets the wall time of the whole suite. Its median case takes about 465 ms, its simplest ones about 40 ms, so the cost is in the user interactions of a case (the file has 129 `user.type` calls, 208 `user.click` calls and 53 `fill` calls), not in rendering. The drafter did **not** profile which interaction is the expensive one; the builder does (see "Behavior", step 1). Two cases of the file carry an explicit 15 s timeout (`}, 15_000)` near line 1993 and 2004, the "Health rules" cases that add and set several rules) instead of being shortened.

After this task, the cases of these files do less work for the same assertions, so each stays well inside the 5 s default under load, and no case carries a timeout argument. No product code, test setting or timeout value changes.

Three backlog lines are replaced by this task: `service-test-panel` (the suite times out under load), `target-dialog-test-flake` (the "under 1000 ms" criterion depends on machine load) and `service-form-json-and-cert-rows` (two cases carry a 15 s timeout). The same timeouts are named in the non-blocking findings of `service-public-toggle` (item 1) and `dashboard-public-switch` (N2); they are not separate lines.

Requirements covered: none of the FR or NFR list. This is test reliability and speed (`TESTING.md`). Every behavior a changed case proved is still proved by the same assertions.

Out of scope:

- **Any sign-in test** (`features/sign-in/**`). `sign-in-locked-screen` owns that folder while it runs. `App.test.tsx` is in scope (the user decided so after that task's file ruled out touching it), but a case that tests the sign-in screen's own behavior is not shortened here.
- **Splitting `AddServiceForm.test.tsx` into several files.** `TESTING.md` says "Do not split only the tests". The user chose faster interactions over a split.
- **Changing the runner:** `frontend/vite.config.ts` (the `test` block, worker count, isolation, `testTimeout`), `src/test/setup.ts`, `package.json`, the lockfile. A timeout value is never raised, in the config or in a case: that hides the cause.
- **Product code** (`*.tsx` and `*.ts` that are not tests) and everything under `src/test/`. A shared test helper is not added (`ARCHITECTURE.md` and `AGENTS.md`: a new shared abstraction is a question for the user); each file keeps its own helpers.
- **The files that use fake timers** (`ServiceList.test.tsx` and any test that calls `vi.useFakeTimers`): their `userEvent.setup({ advanceTimers })` and `fireEvent` use is the rule in `TESTING.md` and stays.
- **Cases not on the list below that take under 1.5 s,** and the cases of files outside the list. A case that adds 21 rows is shortened only if the same assertion survives (see "Behavior"); the 21-row cases of `HealthRulesGroup.test.tsx` and `TargetDialog.test.tsx` already click with `fireEvent` and stay as they are.
- **The backend** (`backend-test-hardening` is merged).

## Prerequisite

None. The builder checks first that the seven files below exist and that `AddServiceForm.test.tsx` has the two `15_000` cases; if the `15_000` cases are gone, it says so and skips them.

## Role and ownership

Role: Frontend.

You may change these test files, and only these:

- `frontend/src/features/service-form/components/AddServiceForm.test.tsx`
- `frontend/src/features/service-form/components/ServiceForm.test.tsx`
- `frontend/src/features/service-form/components/EditServiceForm.test.tsx`
- `frontend/src/features/service-form/components/HealthRulesGroup.test.tsx`
- `frontend/src/features/alert-list/components/TargetDialog.test.tsx`
- `frontend/src/App.test.tsx`
- `frontend/src/features/service-form/components/RequestRowsGroup.test.tsx`

No other file. Inside these, the work is on the cases the step 1 measurement shows to be slow; other cases change only where a shared helper or a `setup()` that they use changes.

You may not change: any other file under `frontend/src/` (including every sign-in test, `src/test/**` and every non-test file), `frontend/vite.config.ts`, `frontend/package.json`, `frontend/package-lock.json`, other build or lint configuration under `frontend/`, `backend/**`, `e2e/**`, `docs/openapi.yaml`, or `docs/**` (except your own plan file, `docs/tasks/frontend-test-hardening.plan.md`).

Shared files: none beyond the test files above, which this task owns while it runs. Tasks that run at the same time: `sign-in-lockout-api` (backend) and `sign-in-locked-screen` (only `frontend/src/features/sign-in/**`; its file forbids it to change `App.test.tsx`). Neither changes a file above. If the builder finds that `sign-in-locked-screen` has changed one of them, it stops and reports.

## Operations used

None. The tests keep mocking the API wrappers as they do.

## Behavior

### 1. Measure first

Before any change, on the default branch's version, the builder records in the plan:

- The verbose duration of every file above (`npx vitest run <file> --reporter=verbose` from `frontend/`, or the JSON reporter), run alone, with the load average at the time.
- The ten slowest cases of `AddServiceForm.test.tsx` and, for the slowest three, which interactions take the time: a profile or a timing wrapper around `user.type`, `user.click`, option selection (`chooseMethod`, `chooseKind`) and `waitFor`. The drafter's guess is per-action delays and many pointer events in Base UI `Select` and `Switch` interactions, not typing alone; the builder replaces the guess with the measurement.
- The test count of each file, which must not change (see criteria).

If no change below lowers the sum of durations of `AddServiceForm.test.tsx` by at least a fifth, the builder stops and reports where the time is (see "Stop and ask when"): the premise is then wrong and this file does not apply.

### 2. The changes

The goal is less work per case with the same assertions. The builder uses these, in this order of preference, and measures each against step 1:

1. **No wait between user actions.** `userEvent.setup({ delay: null })` where a file creates its user (`setup()` helpers at about line 39 of `AddServiceForm.test.tsx`, 73 and 451 of `ServiceForm.test.tsx`, 50 of `EditServiceForm.test.tsx`, and the others in the list). By default user-event waits one macrotask between actions. This stays on `user-event` and keeps the rule in `TESTING.md` (a test that uses fake timers is not touched).
2. **Entering text that is not the subject of the case in one step.** The shared `fill` helper, the `rule` helper and other helpers that type a name or a URL only to get a valid form may enter the text with one `user.paste` after focusing the field, or one `fireEvent.change` (the file already uses `fireEvent.change` in its `rule` and `setUrl` helpers, and `TargetDialog.test.tsx` uses `fireEvent.click` for 21 adds, accepted by the verifier of `target-dialog-test-flake`). Whatever is used must fire the input event the form listens to, so the field value, the dirty state and the clearing of a field's error behave as they did; a case whose assertions fail after the change is not changed that way.
3. **Key-by-key typing stays where typing is the behavior:** a case about editing a field removing its error, `{Enter}` submitting, `{Backspace}`, a message that counts characters, a case about focus or Tab order, and every case whose title or assertion is about keyboard use (NFR-4). The builder lists in the plan each helper and each case it left on `user.type` and why.
4. **Shorter cases for the two `15_000` cases:** the two "Health rules" cases of `AddServiceForm.test.tsx` ("sends Text, false and true rules in order…", which adds four rules and chooses two kinds, and "does not send the text typed before the kind became true", which adds one rule and chooses one kind) keep every assertion and lose their timeout argument. Their `rule` and `setUrl` helpers already use `fireEvent.change`, so the cost is in the clicks and the option choosing (`chooseKind`), and means 1 and the measurement of step 1 are what apply; the builder makes them fast by the means above and, where a case still takes over about 1.5 s alone, by moving a part of it into a second case with its own setup (each assertion in exactly one of the cases). Each of the two has no `15_000`, no `timeout`, no third argument.
5. **The 21-row case of `RequestRowsGroup.test.tsx`** ("has no limit on the number of rows", 21 `user.click` adds) may click with `fireEvent.click` for the mechanical adds, as `HealthRulesGroup.test.tsx` and `TargetDialog.test.tsx` already do, with the assertions unchanged. Those two files' 21-row cases are not changed.
6. **`TargetDialog.test.tsx` and `App.test.tsx` call `userEvent` directly or build users case by case**, with no shared `setup()`: where that is so, the builder may create one user per case with `userEvent.setup({ delay: null })` and use it, with the assertions unchanged, and lists the cases it changed.

The means above are a deliberate exception to `TESTING.md` ("other tests use `user-event`") only for mechanical steps that are not the subject of the case: `fireEvent.click` for the repeated adds, and `fireEvent.change` or `user.paste` for filler text. The plan lists each use.

Thresholds, in order: the criterion is the 2.5 s limit below and the one-fifth gain; about 1.5 s is where the builder splits a case; about 1 s is what the two former `15_000` cases are expected to reach, and a case that stays above it with a reason in the plan is not a failure.

The rules that bind every change:

- Every assertion of every case stays, with the same expectation. A case is not deleted, merged with another or made to assert less; a case split in two keeps each old assertion in exactly one half. The number of cases of each file is equal before and after, except for a split, which adds one case per split and is listed in the plan.
- Case titles do not change, except where a split needs two titles, and then each keeps the old words and adds what is different.
- No `timeout` argument, no `{ timeout: … }` option on a `waitFor` or `findBy`, no `testTimeout`, no `vi.useFakeTimers` or `setTimeout` is added or raised anywhere. A `waitFor` that exists stays.
- No product file changes. No new file is added under `src/test/`; a helper that more than one file needs is written in each file.
- Mocks, fixtures and the shape of what `createService`, `updateService` and the other wrappers are called with are not changed.

### Known gaps

- jsdom and the form's rendering cost are not changed, only the interactions of a case; a very slow runner could still pass a limit with enough load.
- `delay: null` could remove a gap that a Base UI `Select` or `Switch` needs to settle; the builder measures, and where a case turns flaky it keeps the default delay for that case and lists it.
- `fireEvent` and `user.paste` skip the key events a real keyboard sends. Cases about the keyboard stay on `user.type`; the end-to-end suite and the manual check cover the rest.

## Structure

Edits of the seven test files, and the plan file. No new file, no new shared helper.

## Design reference

None.

## Dependencies

None. `user-event` is `14.6.10`, which supports `delay: null` and `user.paste`; `package.json` and the lockfile do not change.

## Acceptance criteria

All run from `frontend/`; none is an integration test.

**Measurement and speed**

- The plan has the "before" numbers of step 1 and the same numbers after: per file, the sum of case durations and the test count. The test count of each file is unchanged (except listed splits).
- By running: `AddServiceForm.test.tsx` alone takes at least a fifth less than before (sum of durations, same machine, load noted). No other number is required: a time target depends on the machine. If this is not met, stop and report (see "Stop and ask when").
- By running: no case of the seven files takes more than 2.5 s in a single-file run at a load average of the builder's choosing, noted in the plan; the two former `15_000` cases take about 1 s or less alone (their durations are in the plan). A case that is still above 2.5 s is listed in the plan with its interactions and a reason, and is a finding for the report; it is not given a timeout.
- By running under load: `npm test` passes three times in a row while the machine runs one busy loop per CPU core (`yes > /dev/null` started once per `sysctl -n hw.ncpu` core, each process stopped afterwards by its own process id; the builder checks that none of its own is left running, and does not stop any process it did not start, because other sessions share the machine). The plan states the load and the result. A single timeout in a file of this task is a finding to report, not to retry away.

**Nothing weakened**

- By reading, per file: the diff changes only how text is entered, how rows are added and how users are created, or splits a case; every `expect` of the old version is present in the new one (the builder compares the old and new `expect` lines per case, and the plan records the count of `expect(` per file before and after, with the reason for any difference).
- No `15_000`, no third argument to `it`, no `{ timeout:` and no `useFakeTimers` was added anywhere in the diff, and `vite.config.ts` has no change (`git diff --stat` lists only the allowed files).
- Cases that are about typing or the keyboard still use `user.type` with the keys they used (`{Enter}`, `{Backspace}`), and the plan lists them.
- By mutation, the sped-up cases still discriminate. The builder runs each, restores the code after, and notes which tests fail: (a) in `AddServiceForm.tsx`, send `name` trimmed of its last character, or put the URL in the wrong field: the "sends what was typed…" case fails; (b) make Enter in the name field not submit: the keyboard cases fail; (c) make editing a field not clear its server error: the "editing a field removes its error…" case fails; (d) in the Health rules group, send the rules in reverse order: the "sends Text, false and true rules in order…" case fails; (e) there is no row cap in the product today, so the mutation adds one of 20: in `frontend/src/components/NameValueRows.tsx` (the add button of the request rows and the target headers) the no-limit cases of `RequestRowsGroup.test.tsx` and `TargetDialog.test.tsx` fail, and in `HealthRulesGroup.tsx` (its own add and `append`) the 21-rules case of `HealthRulesGroup.test.tsx` fails. The mutations change product files temporarily and only to be run and restored; `git diff --stat` after each restore must show no product file. A mutation that survives is reported, with the case it should have failed.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed.

## Verifier checks

- **By reading:** the diff lists only the allowed test files and the plan; `expect` counts per file match the plan; no timeout, `useFakeTimers` or sleep was added; no case was deleted; each case kept on `user.type` is about typing or the keyboard; no helper was added under `src/test/`; no product file changed. Compare each former `15_000` case with its new version line by line.
- **Run it:** `AddServiceForm.test.tsx` alone and the whole suite (`make test-frontend`) once with the verbose or JSON reporter, and report the sum of durations of `AddServiceForm.test.tsx` against the plan's "before"; the whole suite once under load as the criteria describe, with only processes you started.
- **Mutation checks:** repeat at least (a), (c) and (e) above, and one of your own on a case the builder converted to `user.paste` or `fireEvent.change` (change the value the form sends for that field and see the case fail).
- **Inputs to try:** run the seven files with `--sequence.shuffle` (a case must not depend on the previous case's state); run `AddServiceForm.test.tsx` with `-t` for one of the converted cases alone.

## Stop and ask when

- The contract, a requirement, or this file conflict with each other.
- No change lowers the sum of durations of `AddServiceForm.test.tsx` by a fifth: report the measured split (typing, clicks, selects, waits, render), and do not change a runner setting, split the file or raise a timeout.
- A converted case fails and the only way to make it pass is to change an assertion, a mock or a product file: stop and report the case. Never change a test to make it pass.
- `sign-in-locked-screen` has changed one of the seven files, or a case you need to shorten tests the sign-in screen's own behavior.
- You think you need a change outside your paths (the runner config, `src/test/`, a product file, a dependency), or a new shared helper.
- A convention in `CONVENTIONS.md` or `TESTING.md` seems to prevent what this file asks for (for example `fireEvent` where `TESTING.md` asks for `user-event`: the file allows it only for mechanical steps that are not the subject of the case, and lists each).

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps (one commit per file, or per technique), push your branch (never the default branch), and finish with a short report: branch name, what changed, the before and after numbers of step 1 per file, where the time was (from the measurement), the cases that stay on `user.type` and why, the splits, the load and result of the three loaded runs, the mutation results, dependency versions (none changed), cases still over 2.5 s, and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
