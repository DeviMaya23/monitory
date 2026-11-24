# Verifier report: frontend test hardening

Branch: `verify/frontend-test-hardening` (the builder's `feat/frontend-test-hardening` at `a205088`, plus this report).

Verdict: no Blocking findings. `make check` passes. One Non-blocking finding: a first `make check` run at load average 47 to 160 timed out three cases (they passed alone and in a rerun).

Integration tests: not run. The task changes seven frontend test files only; no code with integration tests is touched.

## 1. `make check`

- First run, load average 29 to 47 and spiking to 160 from other sessions: failed. `npm ci` had not been run, so `eslint` was missing; after it, `make test-frontend` had 3 timeouts out of 1405 (see N1).
- Second run, load average about 49 (other sessions, no loops of mine): exit 0. Lint, 83 files and 1405 tests, build, `go build` all passed.

## 2. Acceptance criteria

| Criterion | Test or evidence | Real? | Verdict |
|---|---|---|---|
| Plan has before and after numbers per file, test counts unchanged | Plan "Measurements". My count of `it(` and `expect(` per file, base `f10bdc4` against HEAD: App 45/169 → 45/169, TargetDialog 74/307, AddServiceForm 181/776, EditServiceForm 30/132, HealthRulesGroup 10/48, RequestRowsGroup 10/44, ServiceForm 31/109 (all equal). Vitest reports 231, 35, 39, 97, 51, 10 and 12 tests, equal to the plan. | n/a (documentation) | Met |
| `AddServiceForm.test.tsx` at least a fifth faster | I ran the base file alone: 130.7 s (load 29 → 17). The new file alone: 60.1 s (load 72 → 37), 89.5 s (load 160), 128.5 s (a spike to 152). The plan has 131.2 s → 46.1 s. The load was far higher in my runs of the new file than in my base run, and the gain is still more than a fifth in two of three. The third run is a load artefact (one worker starved). | Real: the number is measured, not asserted | Met (plan 65 %; my best 54 %) |
| No case over 2.5 s alone; the two former `15_000` cases about 1 s or less | Plan: slowest 795 ms. Mine, load 37: slowest 1030 ms, none over 2.5 s. The "sends Text, false and true rules in order…" case reached 2963 ms in the run at load 152 and passed. Both former cases have no third argument (`grep 15_000 frontend/src` is empty). | Real: a timeout would fail the case | Met |
| `npm test` passes three times under one busy loop per core | I ran once, 8 `yes` loops by my own pids (all stopped, none left), load 17 → 53: 83 files, 1405 tests passed, 156 s. The plan reports three runs. | Real | Met (1 run of mine; the builder's 3 are not reproduced by me) |
| Every `expect` of the old version is present | Per-line comparison of old and new `expect(`, `waitFor` and `findBy` lines in `git diff -U0`: no removed line contains one of them, except the `userEvent.` to `user.` rename of lines that contain `findBy`, which still contain it. Counts equal (above). | Real by reading | Met |
| No `15_000`, third argument, `{ timeout:`, `useFakeTimers` added; only allowed files | `git diff --stat f10bdc4 HEAD -- . ':!docs'` lists only the seven test files. Added lines contain no `timeout`, `15_000`, `useFakeTimers` or `setTimeout`. | Real by reading | Met |
| Typing and keyboard cases keep `user.type` with their keys | Diff changes only filler entries (names, URLs, host, port, header, rule path, cert days) to `enter`. `{Enter}`, `{Backspace}`, `user.tab` and message-area typing are untouched. | Real by reading | Met |
| Mutations (a) to (e) | I repeated (a), (c) and (e) (including the 21-rules case) and one of my own (section 5). All fail the named cases and none survived. | Real | Met |
| `make check` passes | Second run, exit 0 | n/a | Met |
| Nothing outside the allowed paths | Diff stat above; no `package.json`, lockfile, `vite.config.ts`, `src/test/` or product file in it | n/a | Met |

The task lists no requirement ID (FR or NFR); the cases keep the IDs in their titles.

## 3. Plan check

I read the plan only after the table above.

- Every criterion of the task file has a plan item. The checklist has 12 items for the 12 criteria.
- Every ticked item has a test or a measurement that exists. The numbers I measured (base 130.7 s against the plan's 131.2 s; test and `expect(` counts) agree with the plan.
- The plan says `make check` passed. That was true for the builder's run and for my second run, not for my first (N1).
- Plan, "Measurements": the "Cases over 2.5 s before" column shows 0 for `AddServiceForm.test.tsx`, where the task file counts 24 in its own load. This is a difference of load, not of code; I got 0 too at the base's best load (max 2358 ms).
- The plan says no case was split, and the diff has no split (equal `it` counts).
- Plan differences from the diff: none. The plan says the `enter` helper is in the three files `AddServiceForm`, `ServiceForm` and `EditServiceForm` and nowhere under `src/test/`; the diff agrees.
- The task file says `fireEvent.change` is also allowed; the plan used `user.paste` only. Allowed.

## 4. Rule checks

- Dependencies: `package.json` and the lockfile are not in the diff; `user-event` stays 14.6.10. No dependency added.
- Layer boundaries, data scoping and transactions in `CONVENTIONS.md` do not apply: test files only.
- Exceptions to `TESTING.md` ("other tests use `user-event`"): `fireEvent.click` once (RequestRowsGroup 21 adds), `user.paste` through a local `enter` helper. Both are the task's listed exceptions, and the plan lists them. `enter` is written in three files, as the task asks (no shared helper, nothing under `src/test/`).
- `userEvent.setup({ delay: null })` is used; no fake timers added or touched.
- Component library and design reference: no component, markup or CSS in the diff.
- Verifier checks of the task file: diff lists only allowed files and the plan (yes); `expect` counts match (yes); no timeout or sleep added (yes); no case deleted (yes); each case kept on `user.type` is about typing or the keyboard (I read the diff: the unchanged lines are `{Enter}`, `{Backspace}`, one-character edits, message and numeric-filter cases); no helper under `src/test/` (yes); no product file changed (yes, apart from my temporary mutations, restored). I compared both former `15_000` cases: only `}, 15_000)` → `})` and `fill`-helper/`delay` changes differ, the assertions are as before.

## 5. Mutation checks run (each restored; `git status` clean after each)

| Mutation | Result |
|---|---|
| (a) `serviceInput.ts`: `name` sent without its last character | "sends what was typed, locks the form in flight…" fails |
| (c) `ServiceForm.tsx`: remove `serverErrors.clearField('name')` from the name `onChange` | "editing a field removes its error and its entry, and the last edit removes the summary" fails |
| (e) `NameValueRows.tsx`: add button stops at 20 rows | `RequestRowsGroup` "has no limit on the number of rows" and `TargetDialog` "adds 21 header rows… there is no limit (FR-92)" fail |
| (e) `HealthRulesGroup.tsx`: `append` stops at 20 | "has no limit on the client: 21 rules can be added" fails |
| Own: `serviceInput.ts`: TCP host sent without its first character (host is entered by `enter`/paste in the converted cases) | 12 cases fail across the three files, including the "sends a host with spaces and markup as typed" case (NFR-7) |

I did not run (b) or (d); the builder's plan reports them and they are not among the verifier's required ones.

## 6. Other attempts

- `--sequence.shuffle` over the seven files (seed 1795524596448): 7 files, 475 tests, all passed (no case depends on the previous one).
- `AddServiceForm.test.tsx -t "does not send the text typed before the kind became true"` alone: passed.
- Boundaries: paste into a field that already has a value (` two`, `/more` appends in `ServiceForm.test.tsx`) passes, so the caret ends after the existing text. The `' 5432 '` and `<img …>` filler entries pass through paste unchanged (paste does not parse `{`/`[` as keys, which `user.type` would).

## 7. Findings

### Blocking

None.

### Non-blocking

**N1. Timeouts at a load of about 47 or more.** Category: test quality. In my first `make check`, at a load average of 47 to 160 caused by other sessions (not by me), 3 cases timed out at 5 s: App "Add service … a valid submit ends on the dashboard…", App "after a visit to the dashboard, the 201 drops the cached list…" and EditServiceForm "sends each edited value and the rest as loaded…". Both files passed alone (90 tests, 12.8 s) and in the second `make check`, and the whole suite passed under 8 busy loops. Reproduce: run `make test-frontend` while the machine's load is above about 45. Matters when: the suite runs on a CI runner or a shared machine at load above 5 times the core count; those three are the cases to look at first (they render the full form and click through the dashboard). The task treats a single timeout as a finding, not a retry. Not Blocking: it is a transient overload, the cases are inside 5 s alone, and the base version was worse (plan: 1 to 3 timeouts per run at load 5 to 8).

**N2. Plan table has no "before" for the 24 cases over 2.5 s.** Category: cosmetic. The plan says 0 over 2.5 s before for `AddServiceForm.test.tsx`; the task file says 24 at its own load. Matters when: someone compares the plan with the task file's table. Report only.

**N3. One gain figure per file is single-run.** Category: test quality. The plan's "after" numbers come from one run each at a different load than the "before" runs; the ratio is approximate. Matters when: a later task wants to claim a time target. Report only (the gain far exceeds the load noise: my runs show 130.7 s against 60.1 s).

## 8. Docs or specs that no longer match

- `TESTING.md` line 168 says "other tests use `user-event`". After this work some mechanical steps use `user.paste` or `fireEvent.click`, and every `setup()` passes `{ delay: null }`. The user may want one line there on the `delay: null` default and the "mechanical steps only" exception, so a later builder does not undo it.
- `docs/tasks/backlog.md`: the three lines this task replaces (`service-test-panel`, `target-dialog-test-flake`, `service-form-json-and-cert-rows`) are already gone from it; nothing to remove.
- `STACK.md`, `docs/openapi.yaml`, `docs/requirements.md`: no version adopted, nothing changed.
