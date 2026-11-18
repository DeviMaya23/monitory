# Task: service form timing

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

On the Add service screen (`/services/new`) the admin can set how often the service is checked and how a failed check is retried: the board's "Timing" group, with four numbers (check interval, timeout, retries, retry interval) and a live line that shows the longest a check can take against the interval. The values are sent with `createService` as its `settings`. The server's refusals appear on the fields, and the "longest attempt is longer than the interval" refusal appears on the group. Until now the form sends no timing, so every service gets the server's defaults and the admin cannot change them.

Requirements covered:

- FR-41, in part: the admin sets a service's timeout (the default is the board's 10 seconds).
- FR-51: the admin sets the retry count.
- FR-53: the admin sets the retry interval.
- FR-57, in part: the check interval, timeout, retry count and retry interval each have a default; the form starts at the defaults and sends all four; a value outside its range is refused by the server and the server's message is shown on the field (the screen does not know the limits).
- FR-56, in part: a save refused because the longest attempt, timeout × (1 + retries) + retry interval × retries, is longer than the interval shows the server's message on the Timing group; the form also shows the longest attempt and whether it fits, as the board draws, and does not block saving by itself.
- FR-12, in part: the `422` errors for the four paths and for the group are shown on their fields and in the summary.
- NFR-4, in part: the four inputs are reachable by Tab, in the order of the form, and operable from the keyboard; a summary entry for one moves focus to it.

Out of scope:

- **The edit form** (`getService`, `updateService`): not built; the edit task builds the same group from this one.
- **Every other group of the board's form** (query parameters, headers, body, JSON rules, certificate options, the type switch and TCP fields, the public-page switch) and the test panel: their own tasks (backlog).
- **Limits, ranges and hints:** the ranges are deployment configuration, so no range hint is shown and the screen enforces none (`docs/design/README.md`); the server's message names the range.
- **The server's defaults:** the server applies its own when a field is absent, but this form always sends all four, starting from the contract's defaults (see "Decisions").
- **Any change to the server, the contract or the configuration.**

## Prerequisite

`service-form-alerts` and `add-service-screen` are merged (they are). The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `features/service-form/` with `components/AddServiceForm.tsx`, `AlertsGroup.tsx`, `ErrorSummary.tsx`, `FieldErrorText.tsx`, `FormBanners.tsx`, `hooks/useCreateService.ts`, `useLeaveGuard.ts`, `useServerErrors.ts`, `lib/fieldIds.ts` (with `FIELD_IDS`, `focusField` and `errorId`), `lib/fieldLabels.ts`, `lib/alertsGroup.ts`, `service-form.css`, and their tests.
- `lib/api/services.ts` with `createService(input: ServiceInput)` and the generated `ServiceInput`, whose `settings` has `check_interval_seconds`, `timeout_seconds`, `retry_count` and `retry_interval_seconds` (integers).
- In `styles/components.css`: `.group`, `.group--invalid`, `.grid`, `.grid--4`, `.field`, `.field__top`, `.label`, `.input`, `.input--mono`, `.input-group`, `.input-group__addon` and `.error-text` (they exist).

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/service-form/**`, `frontend/src/test/fixtures.ts` (only if a helper is missing) and, in `frontend/src/App.test.tsx`, only the assertion on the `createService` request body (it must expect the new `settings` key); nothing else. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `frontend/src/styles/components.css`, `frontend/src/components/ui/**`, `backend/**`, `docs/**` (except your own plan file, `docs/tasks/service-form-timing.plan.md`). Do not change `features/alert-list/**`, `features/service-list/**` or `features/sign-in/**`.

Shared files this task touches: everything under `features/service-form/` is owned by this task while it runs. `frontend/src/App.test.tsx` and `frontend/src/test/fixtures.ts` are also touched by `public-dashboard-screen` (it adds a route and fixtures); this task changes in them only the one body assertion and, if a helper is missing, adds it, so a conflict is limited to neighbouring lines and the user resolves it when merging. Tasks that may run at the same time: the backend tasks (the delivery lane and the probe lane; none touches `frontend/`) and any frontend task outside `features/service-form/` (`public-dashboard-screen` changes `App.tsx` and its own feature; `select-test-flake` changes one `ui` test). The milestone 3 form tasks (request rows, JSON rules, certificate options, TCP fields) and the edit screen wait for this one: they build in the same feature.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `createService` | `POST /api/services` | As the screen already handles them (201, 422, 409 `service_name_taken`, 409 `service_limit_reached`, 413, 403 `csrf_failed`, 401, anything else); no new status or code. Real on the server. |

The request body gains `settings`: `{ check_interval_seconds, timeout_seconds, retry_count, retry_interval_seconds }`, four integers. The server answers `422 validation_failed` with errors whose `field` is `settings.check_interval_seconds`, `settings.timeout_seconds`, `settings.retry_count` or `settings.retry_interval_seconds` (code `out_of_range`, a message with the range, for example `The check interval is 30 to 86400 seconds.`), or the bare `settings` (code `check_budget_exceeded`, a message with the numbers; sent only when all four are in range). One field gets at most one error.

## Behavior

### What exists

The form has the groups Service (name), Request (method and URL) and Alerts, with the discard question, the error summary for a `422` (paths with no input are listed as plain text), the banners and the footer. `useCreateService` sends `name`, the HTTP check and the alert fields. `useLeaveGuard` counts the form as changed when any value differs from its start.

### The Timing group

A `fieldset.group` with the `legend.group__legend` `Timing`, placed after the Request group and before the Alerts group (the board's order), holding a `div.grid.grid--4` with four fields and, below it, the summary line.

| Field | Label | Control | Starts at |
|---|---|---|---|
| Check interval | `Check interval` | `div.input-group` with `input.input.input--mono`, `type="text"`, `inputmode="numeric"`, and the addon `s` (`aria-hidden`) | `60` |
| Timeout | `Timeout` | the same, addon `s` | `10` |
| Retries | `Retries` | the same, addon `times` | `2` |
| Retry interval | `Retry interval` | the same, addon `s` | `10` |

The four starting values are named constants in the feature (`lib/timingGroup.ts`, new), the contract's defaults and the board's; the form shows them as text and always sends all four (see "Decisions"). There is no placeholder and no range hint. The ids of the summary line and of the group error are constants in the same file.

**The summary line,** a `p.timing-sum` below the grid, shown whenever all four values are whole numbers (see "Client checks"): `Longest attempt:` then, in a mono span, `{timeout} × (1 + {retries}) + {retry interval} × {retries} = {n} s` and then `fits in the {interval} s interval.` when `n` is not more than the interval, or `exceeds the {interval} s interval.` when it is. The `×` is U+00D7. It updates as the admin types and stays while a save is in flight. It shows the numbers as parsed (`007` reads `7`; zero retries reads `10 × (1 + 0) + 10 × 0 = 10 s`). It is shown for information: it does not stop saving, and when any of the four is not a whole number, or the result would exceed `Number.MAX_SAFE_INTEGER`, the line is not shown. It is not a live region. The group's `aria-describedby` names the line while it is shown and the group error while there is one, and is absent when neither is shown.

### Client checks

On submit, each of the four must be a whole number: its text, trimmed, is one or more digits (no sign, no decimal point, no letters) and not more than `Number.MAX_SAFE_INTEGER`. A field that is not one shows `Enter a whole number.` under it, focus goes to the first invalid field of the whole form in the order of the form (Name, URL, then the timing fields, as the form library does), nothing is sent, and the message goes when that field is edited. Everything else (the range, the worst-case rule, zero retries) is the server's. The values are sent as integers (the trimmed text as a number).

### What is sent

`settings: { check_interval_seconds, timeout_seconds, retry_count, retry_interval_seconds }`, always all four, in addition to what the form already sends.

### Saving and failures

While a request is in flight the four inputs are read-only, with the fields the form already locks. Nothing else about saving changes. For a `422`:

- A field error for one of the four paths is a mapped path: in the summary the entry is `{label}: {message}` with the label `Check interval`, `Timeout`, `Retries` or `Retry interval`, a link that moves focus to that input; the same message, as the server sent it, shows under the input (`p.error-text` with the `CircleAlert` icon, `aria-invalid="true"` and `aria-describedby` on the input).
- The bare `settings` error is shown on the group: a `p.error-text` with the `CircleAlert` icon as the first child after the legend, holding the server's message as it is; the group gets the class `group--invalid`; the group's `aria-describedby` names the summary line and this error (as the board does). In the error summary its entry is `Timing: {message}` as plain text with no link (it has no single input), like the bare `headers` of the target dialog.
- The error of a field and its summary entry go when that input is edited. Editing any of the four also removes the bare `settings` error and its entry (the worst-case rule depends on all four, so the old message is stale).
- Each message is the server's `FieldError.message` as it is. Focus after a `422` is still on the summary.
- Every other path behaves as before, including an unknown one, which stays plain text.

Every label, hint and message is rendered as text (NFR-7).

### Leaving without saving

The form counts as **changed** (the footer says `Unsaved changes`, Cancel and the back link ask, and the browser's unload prompt is armed) when any value differs from where it started: as before for the existing values, and now also when any of the four timing texts is not equal to its starting text (typing a space after `60` counts as a change).

### Decisions

- **The starting values are the contract's defaults as constants** (`60`, `10`, `2`, `10`), by the user's decision. If a deployment configures other defaults, the form still starts at these and the server's range messages guide the admin.
- **The summary line is a display of FR-56's formula** and duplicates the rule on the client for information only; the server decides and its message is the one shown as an error.
- **The wording not on the board** (decided here; approving this file approves it): `Enter a whole number.` for a field that is not a whole number; the label `Timing` for the bare `settings` entry in the summary.
- **A deviation from the board:** the board draws the group error's summary entry as a link; here it is plain text with no link, because the group error belongs to four inputs and none in particular (the bare `headers` of the target dialog is the precedent). The user may list it in `docs/design/README.md`.

### Known gaps

- **No range or limit shown:** the admin learns the range from the server's message after a refused save.
- **The starting values can differ from the deployment's defaults** (see Decisions).
- **The summary line is computed on the client** with the contract's formula; if the server's rule changes, the line is wrong until updated.
- **A very long number** is refused with `Enter a whole number.` rather than as out of range.
- **The edit form does not have the group yet.**

## Structure

By `ARCHITECTURE.md` and `CONVENTIONS.md`. Names marked "new" do not exist yet and are fixed by this file; others are the builder's choice. One hook per concern, each with a colocated test written in the same step.

- `features/service-form/lib/timingGroup.ts` (new, with a test): the four starting values, the four field names and labels and addons, `Enter a whole number.`, a function that reads a text as a whole number (or reports it is not one), and the pure function that gives the longest attempt and whether it fits (inputs the four numbers).
- `features/service-form/components/TimingGroup.tsx` (new, with a test): the group, taking what it needs from the form (`control`, `register`, `saving`, each field's client and server error, the group's server error, `clearField`) as `AlertsGroup` does. It holds no request logic.
- `features/service-form/lib/fieldLabels.ts` and `fieldIds.ts` (and tests): `FieldTarget` gains the four paths `settings.check_interval_seconds`, `settings.timeout_seconds`, `settings.retry_count`, `settings.retry_interval_seconds` (labels `Check interval`, `Timeout`, `Retries`, `Retry interval`); `FIELD_IDS` gets an id for each input. The bare path `settings` is not a field target; it has the label `Timing` and no input.
- `features/service-form/components/AddServiceForm.tsx`: places the group, adds the four values (as text) to the form values, passes the group's errors, clears the right errors on edit, and shows the client errors.
- `features/service-form/hooks/useServerErrors.ts` (and test): the bare `settings` entry has the label `Timing` and no target; a way to read its message (`errorFor` for the group) and to clear it when any of the four is edited.
- `features/service-form/hooks/useCreateService.ts` (and test): `ServiceFormValues` gains the four values; the body gains `settings` with integers.
- `features/service-form/hooks/useLeaveGuard.ts` (and test): takes the four values; "changed" as above.
- `features/service-form/service-form.css`: the `.timing-sum` rules copied from `docs/design/service-form.css` (values only: the flex layout, wrap, gap, margin, small text, muted colour, and the mono span's text colour); nothing else (the group, grid and input-group rules exist in `components.css`).

## Design reference

Reference only, read-only: `docs/design/service-form.html` (the Timing group in the idle states and the "longest attempt exceeds the interval" error state) with `docs/design/service-form.css` and `components.css`. Copy values and rules from the styles; never copy board markup or component code. Icons from Lucide only. Where the board and the contract disagree the contract wins: the board's group error text is a fixed sentence, the contract's is the server's message, which is shown as it is (`docs/design/README.md`). The board draws no state with a field out of range; it is the same field-error look the other fields use.

Texts copied from the board as written: `Timing`, `Check interval`, `Timeout`, `Retries`, `Retry interval`, the addons `s` and `times`, `Longest attempt:`, `fits in the {n} s interval.`, `exceeds the {n} s interval.` and the `{timeout} × (1 + {retries}) + {interval} × {retries} = {n} s` line.

## Dependencies

None. `react-hook-form` and `lucide-react` are installed; `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Mock `createService` at the wrapper boundary as `AddServiceForm.test.tsx` does, keeping the real query key; use the `problem`, `validationProblem` and `fieldError` fixtures; use `user-event`.

**`lib/timingGroup.ts`**

- The starting values are `60`, `10`, `2`, `10`. A text of `0`, `60`, ` 12 ` (trimmed) and the largest safe integer read as whole numbers; `''`, `' '`, `-1`, `1.5`, `1e3`, `abc`, `+5` and a number above the largest safe integer do not.
- The longest attempt for (interval 60, timeout 10, retries 2, retry interval 10) is 50 and fits; for (30, 10, 3, 10) it is 70 and exceeds; for a case where the worst case equals the interval it fits (`n <= interval`); zero retries gives the timeout alone.

**`useCreateService` and `useLeaveGuard`**

- The request body has `settings` with the four integers given (`'45'` sends `45`), and with the defaults sends `60`, `10`, `2`, `10`, next to the existing keys (FR-41, FR-51, FR-53, FR-57).
- "Changed" is false at the start; true when any one of the four texts differs from its start, including a trailing space; false again when the text is put back.

**`useServerErrors`, `fieldLabels`, `fieldIds`**

- Each of the four paths maps to its label with its target and has an element id; the bare `settings` maps to the label `Timing` with no target; `check.headers[2].value` and `toString` still map to themselves with no target. The group's message is readable and goes when cleared; clearing a field's error removes only that field's entries.

**The form (`AddServiceForm.test.tsx`, `TimingGroup.test.tsx`)**

- Idle: the `Timing` group shows between the Request and Alerts groups with four inputs labelled `Check interval`, `Timeout`, `Retries` and `Retry interval`, valued `60`, `10`, `2`, `10`, each in an input group with its addon, no placeholder and no range hint, and the line `Longest attempt:` `10 × (1 + 2) + 10 × 2 = 50 s` `fits in the 60 s interval.`; the footer status is empty (FR-41, FR-51, FR-53, FR-57).
- The line updates as the admin types: interval `30`, retries `3` gives `10 × (1 + 3) + 10 × 3 = 70 s` and `exceeds the 30 s interval.`; clearing a field or typing letters hides the line; making the numbers fit shows `fits` again. Saving with the line saying `exceeds` still sends the request (FR-56: the server decides).
- Send: with nothing touched the body has `settings` of `60`, `10`, `2`, `10` as integers; with `45`, `5`, `0`, `1` typed it has those, and ` 12 ` is sent as `12`.
- Client checks: an empty, blank or non-numeric value in any field shows `Enter a whole number.` under it, focus goes to the first such field in the order of the form, nothing is sent, and editing the field clears its message; with two bad fields both show.
- In flight: the four inputs are read-only and become editable after a failure.
- A `422` with `settings.timeout_seconds` and `settings.retry_count` errors in that order: the summary lists `Timeout: {message}` then `Retries: {message}`, each message shows under its input with `aria-invalid` and `aria-describedby` pointing at it, each entry's link moves focus to its input, and the summary has focus. A server message with markup shows as text (NFR-7). Editing one input removes only its error and entry, and also the group's error if there is one.
- A `422` with the bare `settings` error (`check_budget_exceeded`): the group shows the server's message as it is under the legend with the `CircleAlert` icon, has the class `group--invalid` and `aria-describedby` naming the summary line and the error; the summary lists `Timing: {message}` as plain text with no link; the summary has focus; editing any of the four inputs removes the group's error, the class and the entry, and a `422` that leaves only that entry also removes the summary (FR-56).
- A `422` for `check.url` and a timing error together: both are shown and cleared independently.
- Leaving: changing a timing value makes the footer say `Unsaved changes`, Cancel opens the discard question and the unload prompt is armed; putting the value back empties the status and Cancel leaves at once.
- Tab order: Tab goes from the URL field to Check interval, Timeout, Retries and Retry interval in that order, then to the alert switch (NFR-4).
- Replaced on purpose, all in the files named: (1) tests that used `settings` as the example of an unmapped path now use another one (`check.headers[0].value`), because `settings` is now the group's path: `fieldLabels.test.ts` (the `maps %s to itself` list), `useServerErrors.test.tsx` (the case with `fieldError('settings', …)`), and in `AddServiceForm.test.tsx` "lists an unmapped path as plain text…" (it also sends the code `check_budget_exceeded`, so it needs another path and another code, not only a rename) and "lists a path for settings as plain text…". (2) Tests that assert the request body now expect the `settings` key: in `AddServiceForm.test.tsx` "sends what was typed…", "Try again sends the same values…" and "sends messages exactly as typed with alerts off"; `useCreateService.test.tsx` (the `toStrictEqual`); `App.test.tsx`'s body assertion. (3) Tests that assert the groups or the Tab order: in `AddServiceForm.test.tsx` the legend list `['Service', 'Request', 'Alerts']` becomes `['Service', 'Request', 'Timing', 'Alerts']`, and the Tab-order case (URL, then the alert switch and messages) now has the four timing inputs between the URL and the switch. (4) Typed fixtures: `useCreateService.test.tsx`'s `VALUES: ServiceFormValues` and the `Harness` of `useLeaveGuard.test.tsx` get the four new values. Nothing else is loosened.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

## Verifier checks

- **By reading `useCreateService.ts`, `TimingGroup.tsx` and `AddServiceForm.tsx`:** the body always has the four integers; the only client check is "a whole number"; no range, no minimum, no maximum and no worst-case rule blocks a submit; the summary line is computed from the four values for display only; no server message is rewritten.
- **By reading the components:** `TimingGroup` has no request code; no import from `features/alert-list`, `features/service-list` or `features/sign-in`; icons from Lucide only; the starting values and strings are defined once; no literal colour or pixel value where a token exists, other than values copied from the design CSS.
- **Keyboard, by reading:** the order in the form is Name, Method, URL, the four timing inputs, the alert switch and messages, the footer; each input is a labelled control; each error is linked by `aria-describedby`; the summary keeps `tabindex="-1"`.
- **Layout, by reading the CSS (jsdom cannot prove it):** `.grid--4` becomes one column at the existing breakpoint; the `timing-sum` line wraps; the addon is visible on each input.
- **Wording, by reading:** every string of the group is defined once and used from there, with the `×` as written.
- **Contract:** the body matches `ServiceInput.settings`; no status or code beyond those the screen already handles.
- **Mutation checks to run:** send the texts as strings; send nothing for an untouched form; trim nothing; block saving when the line says `exceeds`; show a client range error; map `settings.timeout_seconds` to the wrong input; leave the group error after an edit; leave the field error after an edit; drop the timing values from "changed"; make the bare `settings` entry a link; rewrite the server's message; compute the line with `<` instead of `<=`. Each must fail at least one named test.
- **Inputs to try:** every field empty, one letter, a negative number, `1.5`, a 20-digit number, a number with spaces; 30 / 10 / 3 / 10 (exceeds) and 60 / 10 / 2 / 10 (fits) and exactly equal; a `422` with a field error and the group error together; a `422` followed by editing each input; zero retries; the discard question after changing one value.
- **What the verifier cannot prove:** the look at 360 px and a real server's range messages; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design board or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a shared component, an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- `service-form-alerts` is not merged, or a name this file takes from it is missing.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
