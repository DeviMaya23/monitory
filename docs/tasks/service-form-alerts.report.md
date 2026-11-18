# Verifier report: service form alerts

Branch: `verify/service-form-alerts` (built from `feat/service-form-alerts` at `38c501d`, plus one commit of added tests and this report).

Verdict: **no Blocking findings.** Every criterion is met.

## Checks run

- `make check`: passed. Last run: 0 lint issues, 37 test files, 557 tests (the builder's 552 plus 5 I added).
- First run: one unrelated timeout (`alert-list/TargetDialog.test.tsx`, the header-row case, 5000 ms). It passed on its own at this commit and at the base commit `a98f5b1`, and in two later full runs. Treated as load flakiness, not caused by this diff (see Non-blocking 1).
- A fresh checkout had no `node_modules`; I ran `npm ci` in `frontend/` first (no tracked file changed).
- Integration tests: **not run**. No backend code is touched and none cover this frontend code; the task file says none apply. No criterion depends on them.
- Built app: **not run**. I did not start the binary; this report covers unit and component tests only.

## Criteria

"Real?": yes means the named test fails if the behavior is removed (confirmed by a mutation where listed in "Mutation checks").

| # | Criterion | Test(s) | Real? | Result |
|---|---|---|---|---|
| 1 | Switch with `description`: hint shown, name is exactly the label, hint is the description | `Switch.test.tsx` "names the switch by the label alone and describes it by the hint" | Yes (M7, M8) | Met |
| 2 | Clicking the hint toggles the switch | `Switch.test.tsx` "toggles when the hint text is clicked" | Yes in principle: the hint sits inside the wrapping `label`. Not mutated | Met |
| 3 | Without `description`: no hint element, existing cases unchanged | `Switch.test.tsx` "renders no hint and no description without the prop" plus the 4 old cases | Yes | Met |
| 4 | `unhealthy_message` and `recovery_message` map to their labels and targets; unknown paths (`settings`, `check.headers[2].value`, `toString`) still have no target | `fieldLabels.test.ts` (`maps %s to %s with its target`, existing unknown-path case) | Yes | Met |
| 5 | Each target has an element id | `fieldLabels.test.ts` "FIELD_IDS has a distinct id…" | Partly real: it checks the ids are truthy and distinct, not that they match the text areas. A wrong id is caught by the form tests (M6) | Met |
| 6 | `useCreateService` body: three new keys, `alerts_enabled: false`, untrimmed messages; defaults `true`/`''`/`''` | `useCreateService.test.tsx` (the `toStrictEqual` case and "sends alerts off and both messages exactly as given, untrimmed") | Yes (M1, M2) | Met (FR-20, FR-65) |
| 7 | `useLeaveGuard` "changed": false at start; true with switch off, a one-space message, or text; false when restored | `useLeaveGuard.test.tsx` "changed by the alert settings" | Yes (M3) | Met |
| 8 | Idle: group after Request; switch on and described; `On` word; two labelled text areas with placeholder, 3 rows, no `maxlength`; `0/500` twice; empty footer; buttons unchanged | `AddServiceForm.test.tsx` "shows after the Request group…" and "has no Type control and no test button" | Yes (M12 for `maxlength`, M13 for default) | Met |
| 9 | Typing 12 chars: `12/500` and `0/500`; emoji counts one; paste of 501 kept, `501/500`; 500 gives `500/500` with no error | `AddServiceForm.test.tsx` "counts the characters…", "keeps a paste of 501…"; `AlertsGroup.test.tsx` "counts code points…" | Yes (M4, M12) | Met |
| 10 | Send: untouched body has the old keys plus `true`/`''`/`''`; switch off with `'  down '` and `<b>x</b>` sent exactly; sent when off | `AddServiceForm.test.tsx` "sends messages exactly as typed…", "saving a valid form", generic-banner "Try again" case, `App.test.tsx` | Yes (M1, M2, M13) | Met |
| 11 | In flight: switch disabled, text areas read-only; editable after a failure | `AddServiceForm.test.tsx` "locks the switch and text areas in flight…"; `AlertsGroup.test.tsx` "locks the text areas while saving" | Yes (M6a, M6b) | Met |
| 12 | `422` for both messages: summary order and labels; field errors with `aria-invalid` and `aria-describedby`; links focus the text areas; summary has focus; markup shown as text; first of two errors; editing one clears only its entry; editing the other removes the summary; `settings` stays plain | `AddServiceForm.test.tsx`, nested describe "a 422 for the messages" (5 cases, including `alerts_enabled` as plain text) | Yes (M5, M5b, M11) | Met (FR-12, FR-74, NFR-7) |
| 13 | Leaving: switch off gives `Unsaved changes`, Cancel dialog, unload armed; back on empties it and Cancel leaves; one space is changed | `AddServiceForm.test.tsx` "leaving" (2 cases) | Yes (M3) | Met |
| 14 | Replaced cases changed as listed; nothing else loosened | Diff read: the idle case lost only the counter and switch lines; the three `toStrictEqual` bodies gained the three keys; `App.test.tsx` also gained the keys (not listed, see Non-blocking 3) | n/a | Met |
| 15 | NFR-4: switch and both text areas operable from the keyboard; a summary entry for a message moves focus to its text area | Entry focus: criterion 12. Keyboard: no builder test, so I added "is reached by Tab in the order…; Space toggles the switch" | The builder had no keyboard test; the one I added is real for order and Space | Met (by my added test) |
| 16 | `make check` passes; only allowed paths changed; `package.json` and lockfile unchanged | `make check` run; `git diff a98f5b1 --name-only` | n/a | Met. Changed: `frontend/src/**` and the plan file only |

## Plan check

Read `docs/tasks/service-form-alerts.plan.md` after the criteria.

- Every criterion above appears in the plan. Nothing is missing. The plan has no separate item for NFR-4 keyboard operation, matching the task file (which names no keyboard test).
- Every ticked item has an existing test that checks the behavior (mutations above confirm it).
- Differences between plan and diff:
  - The plan says the backlog line "the edit task builds the same group" was not added. It is already in `docs/tasks/backlog.md` (the "Left out of `service-form-alerts`" line, at the base commit), so the plan note is stale. No action in the diff.
  - Plan says "undid the noise" from Prettier. `useCreateService.test.tsx` still has two reflowed spots on untouched lines (`type Settle = {…}` expanded to multiple lines, and the `check: {…}` object in the body expectation). Cosmetic.
  - Other judgment calls (`App.test.tsx`, `lib/alertsGroup.ts`, `FieldErrorText.tsx`, `aria-disabled` in tests) match the diff.

## Rule checks

- **Dependencies:** `frontend/package.json` and the lockfile have no diff. Versions in use: `@base-ui/react` 1.9.0, `react-hook-form` 7.92.0, `lucide-react` 1.73.0, as the task says. Met.
- **Paths:** nothing outside `frontend/src/` plus the plan file. `features/alert-list/**` and `features/service-list/**` untouched; no import from either into `service-form` or `Switch` (grep). `schema.d.ts` untouched. Met.
- **Verifier checks, by reading:**
  - Body always has the three new keys (`useCreateService.ts`). Messages never trimmed on the client. No `maxlength` and no client check of 500 (grep). The counter uses `Array.from(text).length`. `MESSAGE_MAX` is defined once and used only by the counter. No `dangerouslySetInnerHTML` anywhere in `src`. Messages and errors are React text children.
  - `Switch.tsx`: one new optional prop. Without it the render is the same markup (no ids, no aria attributes). The root is named with `aria-labelledby` pointing to the label's own span, and described by the hint.
  - `AlertsGroup` has no request code. Icons are Lucide (`CircleAlert`). `service-form.css` and `styles/` are unchanged, so there is no literal colour or pixel value.
  - Wording: every group string is defined once in `lib/alertsGroup.ts`, with the curly apostrophe in `service’s`. The only other occurrence of the hint text is in tests.
  - No hand-written widget: the switch uses the `Switch` wrapper; the text area is a plain `textarea` with the project's class (no Base UI primitive exists for it). Design reference code was not copied (the markup is the builder's own).
  - Tab order, Space, labelled controls, `aria-describedby` on errors: verified by my added test and the 422 tests. The summary's `tabindex="-1"` is unchanged (not in the diff).
  - Contract: `ServiceInput` has `alerts_enabled` boolean, `unhealthy_message` and `recovery_message` strings (maxLength 500); the body matches. No new status or code is handled.
- **CONVENTIONS.md:** layer boundaries are respected (components, hooks and `lib` split as in the feature; only `Switch.tsx` imports Base UI). `FieldErrorText` was moved to its own file because of the lint rule on component files, as the plan says. Met.

## Mutation checks run

Each was applied to the source, the named tests were run, and the file was reverted (`git checkout`; the working tree is clean of source changes).

| ID | Mutation | Result |
|---|---|---|
| M1 | `alerts_enabled: true` always (`useCreateService.ts`) | Failed 2: `useCreateService.test` "sends alerts off…", form "sends messages exactly as typed…" |
| M2 | Trim both messages before sending | Failed the same 2 |
| M3 | Drop `!alertsEnabled` from "changed" | Failed 2: `useLeaveGuard.test`, form "counts the switch off as changed…" |
| M4 | Count `text.length` instead of code points | Failed 2: form and `AlertsGroup.test` emoji cases |
| M5 | Pass `recoveryError` text to the unhealthy area | Failed 2: both 422 display and clear cases |
| M5b | Wrong error clear: remove `clearField` on edit | Failed 2: `AlertsGroup.test`, form "editing one text area…" |
| M6 | Swap the unhealthy text area's id | Failed 6 |
| M6a | Text areas editable in flight (remove `readOnly`) | Failed 2 |
| M6b | Switch enabled in flight | Failed 2 |
| M7 | Hint part of the switch's name (remove `aria-labelledby`) | Failed 6, including the Switch name case |
| M8 | Remove `aria-describedby` from the switch | Failed 2 |
| M11 | Add `maxLength={500}` to the text areas | Failed 3 |
| M13 | Default `alerts_enabled: false` in the form | Failed 10 |

Not mutated: the hint-click toggle (criterion 2).

## Inputs tried (not listed in the task file's criteria)

Added to `AddServiceForm.test.tsx` as a new describe "the Alerts group: boundaries and keyboard" (5 tests, all pass):

- Tab order URL, switch, Unhealthy message, Recovery message, Cancel; Space toggles the switch both ways.
- Exactly 500 characters (`500/500`) and 500 plus three spaces (`503/500`): no error, sent untrimmed.
- A line break (`a{Enter}b`): counted as 3, sent as `'a\nb'`.
- Both messages in error, then the switch turned off and on: errors and summary stay.
- A message of one space, then Cancel: the discard question opens.

Also covered by the builder's tests: a message of 501 and an emoji message, `422` then edit, the switch off then on, saving with alerts off, and `alerts_enabled` as a `422` path (plain text, no link). Concurrent writes: a second submit while in flight is still stopped by the `inFlight` ref (unchanged code, existing test).

## Findings

### Blocking

None.

### Non-blocking

1. **Test quality, report only.** `TargetDialog.test.tsx` "adds a header row… (FR-92)" timed out once at 5000 ms in a full parallel run (1 of 3 runs). It is not part of this diff. Matters when: the same case times out again on CI or on another task's branch; then raise its timeout in that file.
2. **Test quality.** The FIELD_IDS test checks that the two ids exist and are distinct, not that they match a rendered element; only the form tests catch a wrong id. Matters when: someone renames an id in `fieldIds.ts` and keeps the old string in the group.
3. **Decision needed.** `App.test.tsx` also changed (the three new keys in a `toHaveBeenCalledWith`); the task file's list of replaced cases does not name it. Nothing was loosened, and the plan states it. Matters when: the user wants the task file's list to be the exact set of changed existing tests.
4. **Cosmetic.** Two spots of Prettier-style reflow in `useCreateService.test.tsx` on lines the task did not touch. Matters when: a later diff of that file is read for review. Report only.
5. **UX, latent.** The server error for a message stays after the admin turns the switch off and on (it goes only when that text area is edited, as the task says). Matters when: the product wants an off service to forget message errors; then the edit-form task decides.

## Docs or specs that no longer match

- `docs/openapi.yaml`, `docs/requirements.md`: none; the body and field errors match `ServiceInput` and FR-12, FR-20, FR-65, FR-74.
- `STACK.md`: no versions to record (none added or changed). The versions this task uses are `@base-ui/react` 1.9.0, `react-hook-form` 7.92.0, `lucide-react` 1.73.0; `STACK.md` does not pin versions.
- `docs/tasks/service-form-alerts.plan.md`: the judgment call "the backlog line was not added" is stale; the line is in `docs/tasks/backlog.md` already. The task file says both "this task adds a line" and "you may change no `docs/**`"; the drafter can drop the first.
- `docs/design/README.md`: no new state added, nothing to update. The switch-off and message-error states are described as reuse in the task file.
- `docs/manual-checks.md`: nothing out of date. This merge makes no heading due by itself (see the pull request).
