# Plan: frontend test hardening

Branch: `feat/frontend-test-hardening`

Integration tests: none apply (frontend test files only). Outcome: `not run: no code with integration tests is touched`.

## Checklist (one item per acceptance criterion)

**Measurement and speed**

- [x] Plan holds the before and after numbers of step 1 per file (sum of case durations, test count). Section "Measurements" below; measured with `npx vitest run <file> --reporter=json` per file, `scratchpad/run.sh`.
- [x] `AddServiceForm.test.tsx` alone: sum of durations at least a fifth lower. File: `AddServiceForm.test.tsx`; technique: `delay: null` in `setup()`, one-step filler text in `fill`.
- [x] No case of the seven files over 2.5 s in a single-file run; the two former `15_000` cases (`AddServiceForm.test.tsx`, "Health rules") about 1 s or less, durations in the plan.
- [x] `npm test` passes three times in a row under one busy loop per core; load and result in the plan.

**Nothing weakened**

- [x] Per file, old and new `expect(` lines compared; count before and after in the plan (all seven files).
- [x] No `15_000`, third argument to `it`, `{ timeout:` or `useFakeTimers` added; `git diff --stat` lists only allowed files.
- [x] Typing and keyboard cases keep `user.type` with their keys; list in the plan.
- [x] Mutations (a) `AddServiceForm.test.tsx` "sends what was typed…" (b) Enter keyboard cases (c) "editing a field removes its error…" (d) `AddServiceForm.test.tsx` "sends Text, false and true rules in order…" (e) `RequestRowsGroup.test.tsx`, `TargetDialog.test.tsx`, `HealthRulesGroup.test.tsx` no-limit cases. Results in the plan.

**Repo-wide**

- [x] `make check` passes.
- [x] Nothing outside the allowed paths changed.

## Measurements

Same machine, each file alone, `vitest run <file> --reporter=json`, sum of case durations. The load average was set by other sessions and varied from 13 to 53 between runs (shown in brackets), so the before and after numbers are comparable only roughly. A second, quieter before run of `AddServiceForm.test.tsx` (load 23) gave 155.8 s, so the before number is not the worst case.

| File | Tests before → after | Sum before (load) | Sum after (load) | Cases over 2.5 s before → after | Slowest case after |
|---|---|---|---|---|---|
| AddServiceForm.test.tsx | 231 → 231 | 131.2 s (18.7) | 46.1 s (13.4) | 0 → 0 | 661 ms |
| ServiceForm.test.tsx | 35 → 35 | 55.7 s (17.6) | 5.3 s (15.7) | 9 → 0 | 399 ms |
| EditServiceForm.test.tsx | 39 → 39 | 28.1 s (53.3) | 8.6 s (15.9) | 1 → 0 | 705 ms |
| HealthRulesGroup.test.tsx | 10 → 10 | 6.3 s (52.8) | 1.8 s (16.6) | 1 → 0 | 795 ms |
| RequestRowsGroup.test.tsx | 12 → 12 | 1.8 s (47.5) | 1.2 s (17.1) | 0 → 0 | 353 ms |
| TargetDialog.test.tsx | 97 → 97 | 35.0 s (46.1) | 16.2 s (17.2) | 0 → 0 | 530 ms |
| App.test.tsx | 51 → 51 | 23.7 s (48.1) | 7.9 s (18.3) | 0 → 0 | 764 ms |

`expect(` count per file, before → after (all unchanged; `git diff` shows no added or removed line containing `expect(`, `waitFor`, `useFakeTimers`, `timeout:` and only the two `}, 15_000)` lines removed): AddServiceForm 776, ServiceForm 109, EditServiceForm 132, HealthRulesGroup 48, RequestRowsGroup 44, TargetDialog 307, App 169.

`AddServiceForm.test.tsx` sum: 131.2 s → 46.1 s (-65 %; needs -20 %). In a run at load 17: 40.5 s.

### Where the time was (step 1 profile)

Profile of four of the slowest `AddServiceForm.test.tsx` cases with a timing wrapper around `user.type` and `user.click` (with `delay: null` already on): `user.type` 11 calls, 183 characters, 2414 ms (about 13 ms a character); `user.click` 15 calls, 546 ms (about 36 ms each). So typing, one key event per character, is the cost, not Select or Switch clicks (the drafter's guess was wrong). `delay: null` alone lowered the sum from 155.8 s to 132.0 s (a second run at lower load, so only about a sixth at most). Pasting the filler text lowered it to 40.5 s. Ten slowest cases before (ms): 2346 editing a row input removes only its error and entry; 2252 sends the HTTP check… when HTTP(S) is chosen again with a URL; 1955 Remove removes the list's row errors…; 1507 sends what was typed…; 1466 Remove on the query parameters…; 1388 shows a name with markup as text in the toast; 1298 sends the days with the switch on…; 1269 sends Text, false and true rules in order…; 1260 changing the type clears every check…; 1214 sends the rows in order as typed….

The two former `15_000` cases, alone: "sends Text, false and true rules in order…" 603 ms, "does not send the text typed before the kind became true" 345 ms. No split was needed.

## Loaded runs

`npm test` three times in a row with 8 busy loops (`yes > /dev/null`, one per `hw.ncpu` core, started by this session; each was killed by its own process id, none is left). Load average at the start 18.6 (other sessions included), 34.7 at the end. Results: 83 files, 1405 tests passed each time (106.0 s, 105.9 s, 112.3 s). No timeout. (The first kill attempt in the command failed on a shell word-splitting error; the processes were then stopped by their ids and checked.)

## Mutations (each restored; `git status` clean after each)

| Mutation | Result |
|---|---|
| (a) `serviceInput.ts`: name without its last character | 6 failed, incl. "sends what was typed, locks the form in flight…" |
| (a) `serviceInput.ts`: URL without its first character (wrong value in the url field) | 9 failed, incl. "sends what was typed…" |
| (b) `ServiceForm.tsx`: Enter in the Name field prevented | 2 failed: "Enter in the Name field submits once", "Enter while a request is in flight sends nothing" |
| (c) `ServiceForm.tsx`: editing Name no longer clears its server error | 3 failed, incl. "editing a field removes its error and its entry, and the last edit removes the summary" |
| (d) `jsonRules.ts`: rules sent in reverse | 1 failed: "sends Text, false and true rules in order…" |
| (e) `NameValueRows.tsx`: add button stops at 20 rows | 2 failed: RequestRowsGroup "has no limit on the number of rows", TargetDialog "adds 21 header rows… there is no limit (FR-92)" |
| (e) `HealthRulesGroup.tsx`: append stops at 20 | 1 failed: "has no limit on the client: 21 rules can be added" |

No mutation survived. (The first (e) attempt used an undefined variable and failed too broadly; it was redone with `rows.length`.) A mutation of my own on a pasted field is (a): name and URL are now entered with paste in `fill`, and both changes fail the case.

## Uses of the exceptions to `TESTING.md` (each one listed)

- `fireEvent.click` for the 21 mechanical adds: `RequestRowsGroup.test.tsx` "has no limit on the number of rows" only.
- `user.paste` (through a local `enter(user, control, text)` helper, which first clicks the field so it is focused): in `AddServiceForm.test.tsx` the `fill` helper and about 55 filler entries of a name, URL, host, port, header, query name, rule path or certificate days (text of two or more characters, not the subject of the case); `ServiceForm.test.tsx` `typeUrl`, `fillAdd` and the Host/Port entries of the TCP cases and two ` two` / `/more` appends; `EditServiceForm.test.tsx` the Host, Port and URL entries of the type-change case. The helper is written in each of those three files; nothing under `src/test/`.
- `userEvent.setup({ delay: null })`: in the `setup()` of `AddServiceForm`, `ServiceForm` (both), `EditServiceForm`, `HealthRulesGroup`, `RequestRowsGroup`; in `TargetDialog.test.tsx` and `App.test.tsx` one user per case, created in the existing `beforeEach` and used in place of the direct `userEvent.*` calls (every `userEvent.type/click/clear/keyboard/tab/paste` in these two files is now `user.*`; no case was changed otherwise).
- `fireEvent.change` was not added anywhere.

## Cases left on `user.type`

All cases and helpers not in the lists above, in particular: `{Enter}` cases (`Enter in the … field submits`, lines about `{Enter}` in the name, URL and message areas), `{Backspace}` cases (retries field, the URL `{Backspace}` sequence and the retyping of `https://` after it), single-character edits that test that editing clears an error or marks the form changed (`'x'`, `'1'`, `'a'`), message fields (character counts, emoji, whitespace, `a{Enter}b`, lines 870 to 1160 of `AddServiceForm.test.tsx`), `'abc'` into numeric fields (input filtering), the Tab-order case (`user.tab`), `retype` in `EditServiceForm.test.tsx` (clear and type), `HealthRulesGroup.test.tsx` and the remaining typing of `RequestRowsGroup.test.tsx` (few characters, about field edits), and typing in `ServiceForm.test.tsx` of `'abc'`/`'x'`. All `{Enter}` and `{Backspace}` keys are as before. `TargetDialog.test.tsx` and `App.test.tsx` keep typing by key (only the user's delay changed).

## Splits

None. Case counts are unchanged in all seven files.

## Cases over 2.5 s

None in single-file runs (slowest 795 ms, `HealthRulesGroup.test.tsx`).

## Integration tests

`not run: the task changes frontend test files only; no code with integration tests is touched`. `make check`: passed (exit 0, last step `go build ./...`).

## Judgment calls

- Added a local `enter` helper (click, then `user.paste`) instead of `fireEvent.change`, to keep focus and the input event of a real paste. The task allows either.
- The threshold for "filler" was: plain text of two or more characters not in the message-area block; single characters stay typed because they are mostly about editing. `'abc'` inputs for numeric fields stay typed.
- In `TargetDialog.test.tsx` and `App.test.tsx` the user is created in `beforeEach` (module-level `let user`) rather than inside each case, which gives one user per case with fewer edits. No sign-in-screen case was shortened, but `App.test.tsx` cases that sign in now use the faster user too (the typing is unchanged).
- No case needed a keep-default-delay exception: no flakiness was seen with `delay: null` in any file.
- The step 1 profile is of four cases with a timing wrapper (not a profiler); the temporary file used for it was deleted before any commit. The before numbers were taken under load 18 to 53 from other sessions, so after/before ratios are approximate; the 65 % gain on `AddServiceForm.test.tsx` is far larger than that noise.
