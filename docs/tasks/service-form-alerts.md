# Task: service form alerts

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

On the Add service screen (`/services/new`) the admin can turn alerts off for the new service and write the message an alert carries when the service goes down and when it recovers. The form gets the board's "Alerts" group: a `Send alerts` switch, on by default, and the two optional messages with a counter. They are sent with `createService`, which already saves them. The admin sees nothing of the alert text until a later alert task sends it; this task only lets the admin set it.

Requirements covered:

- FR-20, in part: alerts are on for a new service and the admin can turn them off before saving; the choice is sent. (Editing an existing service's switch is the edit form's task.)
- FR-65, in part: the admin writes an unhealthy message and a recovery message of up to 500 characters; they are sent as typed. A message the server refuses as too long is shown on its field. (Editing them later is the edit form's task.)
- FR-12 and FR-74, in part: the server's `422` error for each of the two messages is shown on its field and in the summary.
- NFR-4, in part: the switch and both text areas are reachable and operable from the keyboard, and a summary entry for a message moves focus to its text area.
- NFR-7: a message typed or returned in an error is shown as text.

Out of scope:

- The edit form (`/services/:serviceId`, `getService`, `updateService`): not built. The backlog line "Left out of `add-service-screen`" still holds for the other rows; this task adds a line saying the edit task builds the same group for edit.
- Everything the alert text does after saving: the content of an alert, the default messages and how they are chosen (`alert-dispatch`, on its own branch). The placeholder `Default message is used when empty` is the board's wording and says nothing about what the default is.
- The service form's other groups and the test panel (milestone 3 form tasks, `testServiceCheck`), and the public-page switch (milestone 4).
- Any limit shown or enforced beyond the one below: FR-65's 500 is fixed by the requirement and is drawn on the board, so it is shown (see "Messages").
- End-to-end tests. The milestone's last task writes them.

## Prerequisite

Merged on the default branch. The builder checks first and stops to ask if any is missing; it creates none of them:

- `add-service-screen` and its fix rounds: `features/service-form/` with `components/AddServiceForm.tsx`, `ErrorSummary.tsx`, `FormBanners.tsx`, `hooks/useCreateService.ts`, `useLeaveGuard.ts`, `useServerErrors.ts`, `lib/fieldIds.ts`, `fieldLabels.ts`.
- `components/ui/Switch.tsx` with its test (built in the foundation, no screen uses it yet).
- `createService` on the server saves `alerts_enabled`, `unhealthy_message` and `recovery_message` (it does; `alert-dispatch` states the same). No server change is needed.

This task does not depend on `alert-dispatch`, `target-form-dialog` or any other task in progress.

## Role and ownership

Role: Frontend.

You may change `frontend/src/**`, with the files named under "Structure". You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `backend/**`, `docs/**` (except your own plan file, `docs/tasks/service-form-alerts.plan.md`), or anything else outside `frontend/src/`. Do not change `features/alert-list/**` or `features/service-list/**`.

Shared files this task touches, all owned by this task while it runs:

- `frontend/src/components/ui/Switch.tsx` and `Switch.test.tsx`: one optional prop is added (below). No screen uses the switch yet; every existing case behaves as before.
- `frontend/src/features/service-form/**`.
- `frontend/src/test/fixtures.ts`: only if a helper is missing.

Position: the group goes where the board puts it, after the groups above it and before the public-page group; this task has no public-page group yet, so it follows Request. The milestone 3 tasks insert their groups before it.

Tasks that may run at the same time: none in the frontend. `target-form-dialog` and `alert-dispatch` are merged. A backend task from the delivery chain (`webhook-sender` and later) may run beside it; they change `backend/` only. The later `delivery-failed-notice` and the milestone 3 form tasks wait for this one: they build on the same form.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `createService` | `POST /api/services` | As `add-service-screen` left them (201, 422, 409 `service_name_taken`, 409 `service_limit_reached`, 413, 403 `csrf_failed`, 401, anything else); no new status or code |

`ServiceInput` has `alerts_enabled` (boolean, default true), `unhealthy_message` and `recovery_message` (strings, up to 500). The server counts characters after trimming surrounding whitespace and answers a longer text with `422 validation_failed` and a field error whose `field` is `unhealthy_message` or `recovery_message` (code `too_long`, a message with the limit). One field gets at most one error.

## Behavior

### What exists

The form has three fields (Name, Method, URL), the footer, the banners and the 422 summary, and `useCreateService` sends `{ name, check: { type: 'http', method, url } }`. A field path the form does not know is listed in the summary as plain text with no link (`fieldLabel` in `lib/fieldLabels.ts`). The footer says `Unsaved changes` when the form differs from its start. `components/ui/Switch.tsx` renders a switch whose accessible name is its label text and shows `On` or `Off`; it has no hint line.

### The Alerts group

A `fieldset.group` with the `legend.group__legend` `Alerts`, placed after the Request group, holding a `div.stack` with:

1. **The switch row** (the `Switch` wrapper): label `Send alerts`, hint `To this service’s alert list when it goes down or recovers.`, on by default. The state word is `On` or `Off`, as the wrapper already shows.
2. **A `div.grid`** with two fields, in this order:

| Field | Label | Control | Counter |
|---|---|---|---|
| Unhealthy message | `Unhealthy message` with the muted `(optional)` (`span.opt` inside the `label`) | `textarea.textarea.textarea--sans`, `rows` 3, placeholder `Default message is used when empty`, no `maxlength` | `{n}/500`, in `span.counter` to the right of the label (`div.field__top`) |
| Recovery message | `Recovery message` with the muted `(optional)` | the same | the same |

The group is always shown; the switch being off does not hide, disable or empty the messages (see "Known gaps"). The group has no test panel and no further control.

### Messages

- The counter shows the number of characters typed, counted as Unicode code points (so an emoji counts as one, as the server counts), starting at `0/500`. The limit 500 is a named constant in the feature (`MESSAGE_MAX`). The counter does not change style past 500.
- The text area has no `maxlength`: a paste of more than 500 characters is kept as typed, not cut, and the server's answer decides. The reason is that `maxlength` counts UTF-16 units, so it would refuse text the server accepts. The counter counts what is typed, spaces included: 500 characters read `500/500`, and 500 characters plus three trailing spaces read `503/500`. The client shows no error at any length; the server trims before it counts, so the second text is accepted and 501 non-space characters get a `422` whose message appears on the field (below). A test with a mocked `createService` can show only what the client sends and shows, not what the server accepts.
- A message is sent exactly as typed: not trimmed, an empty one as the empty string `''`. (The server trims and treats empty as "use the default".)

### What is sent

`{ name, check: { type: 'http', method, url }, alerts_enabled, unhealthy_message, recovery_message }`, always all three new keys: `alerts_enabled` as the switch holds it (`true` unless switched off), the two messages as above. The other `ServiceInput` fields are still not sent.

### Saving and failures

While a request is in flight the switch is `disabled`, and both text areas are read-only, together with the fields the form already locks. Nothing else about saving changes; the outcomes, banners, toasts and focus of `add-service-screen` stay as they are, with these additions for a `422`:

- A field error whose `field` is `unhealthy_message` or `recovery_message` is a mapped path: in the summary the entry is `Unhealthy message: {message}` or `Recovery message: {message}`, and it is a link that moves focus to that text area. The same `message`, as the server sent it, shows under the text area (`p.error-text` with the `CircleAlert` icon, the text area gets `aria-invalid="true"` and `aria-describedby` pointing at the error). With two errors for one field, the first.
- The error and its summary entry go when that text area is edited (typing, pasting or deleting), as for the other fields; a `422` that leaves only that entry also removes the summary, as today.
- The summary keeps the server's order. Every other path behaves as before, including an unknown one, which stays plain text.
- Focus after a `422` is still on the summary.
- A `422` carrying a path for the switch cannot occur (a boolean) and is not mapped.

Every message, label and hint above is rendered as text; nothing is `dangerouslySetInnerHTML` (NFR-7).

### Leaving without saving

The form counts as **changed** (the footer says `Unsaved changes`, Cancel and the back link ask, and the browser's `beforeunload` prompt is armed) when any value differs from where it started: as before for Name, Method and URL, and now also when the switch is off, or either message is not the empty string (a message of only spaces counts as changed). An untouched form, and a form returned to its start values, is not changed.

### Known gaps

- **Messages stay editable and are saved when alerts are off.** FR-20 says an off service sends nothing; it does not say the messages must be empty. If the admin turns alerts on later, they apply.
- **No "over the limit" styling** on the counter, and no client check of the 500: the server's message is the only refusal.
- **The edit form does not have the group yet,** and neither does anything show the saved values until `getService` and the edit form exist.
- **The counter's code-point count** and the server's character count are the same for any text except unpaired surrogates, which the browser does not let the admin type.

## Structure

By `ARCHITECTURE.md` and `CONVENTIONS.md`. Names marked "new" do not exist yet and are fixed by this file; others are the builder's choice. One hook per concern, each with a colocated test written in the same step.

- `components/ui/Switch.tsx` (and test): one optional prop `description` (text). When given, it renders the hint (`span.hint`, in `.switch-row__text`, under the label) and the switch's root points at it with `aria-describedby`. The switch's accessible name must stay the label text alone, not the hint: the wrapper names the root from the label's own element (`aria-labelledby` to that element's id, from `useId`), because the hint would otherwise be part of the wrapping `label`'s text. Without the prop the wrapper renders and behaves exactly as today.
- `features/service-form/lib/fieldLabels.ts` and `fieldIds.ts` (and tests): `FieldTarget` gains `unhealthy_message` (label `Unhealthy message`) and `recovery_message` (label `Recovery message`); `FIELD_IDS` gets an id for each text area. The constants for 500, the two default texts' placeholder and the group's strings live in the feature, each defined once.
- `features/service-form/components/AlertsGroup.tsx` (new, with a test): the group, taking what it needs from the form (react-hook-form's `control` and `register`, `saving`, each message's server or client error) and the server-errors hook's `clearField`. It holds no request logic.
- `features/service-form/components/AddServiceForm.tsx`: places the group, adds `alerts_enabled`, `unhealthy_message` and `recovery_message` to the form values (defaults `true`, `''`, `''`), clears the right server error on edit, and passes them on.
- `features/service-form/hooks/useCreateService.ts` (and test): `ServiceFormValues` gains the three values; the body sent has the three new keys.
- `features/service-form/hooks/useLeaveGuard.ts` (and test): takes the three values; "changed" as defined above.
- `features/service-form/service-form.css`: nothing, unless the group needs a rule the project lacks (`.stack`, `.grid`, `.field__top`, `.counter`, `.opt`, `.textarea`, `.textarea--sans`, `.switch-row*` and `.hint` already exist in `styles/components.css`). If one is missing, copy its values from `docs/design/service-form.css` or `components.css` and say so in the plan.

## Design reference

Reference only, read-only: `docs/design/service-form.html`, "Add service" states (the Alerts group in the idle state and the field-error state), with `docs/design/service-form.css` and `components.css`. Copy values and rules from the styles; never copy board markup or component code. Use the `Switch` wrapper; icons from Lucide only. The board has no state with the switch off and none with the messages in error: the first is just the switch showing `Off`, and the second is the same field-error look the other fields use.

Texts copied from the board as written: `Alerts`, `Send alerts`, `To this service’s alert list when it goes down or recovers.`, `Unhealthy message`, `Recovery message`, `(optional)`, `Default message is used when empty`, the counter `{n}/500`.

Texts decided here (not drawn): the summary labels for the two paths (the same words as the field labels) and everything under "Known gaps".

## Dependencies

None. `@base-ui/react` 1.9.0 (Switch), `react-hook-form` 7.92.0 and `lucide-react` 1.73.0 are installed; `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Mock `createService` at the wrapper boundary as `AddServiceForm.test.tsx` does, with the real query key kept; use the `problem`, `validationProblem` and `fieldError` fixtures. Use `user-event`.

**`Switch` (`Switch.test.tsx`)**

- With `description`, the hint text is shown, the switch's accessible name is still exactly the label (not the label plus the hint), and the hint is its accessible description. Without it, no hint element exists and the existing cases pass unchanged. Clicking the hint text toggles the switch, as clicking the label does.

**`fieldLabels` / `fieldIds`**

- `unhealthy_message` maps to `Unhealthy message` with that target, `recovery_message` to `Recovery message`; each target has an element id; `settings`, `check.headers[2].value` and `toString` still map to themselves with no target.

**`useCreateService` and `useLeaveGuard`**

- The request body has the three new keys with the values given, `alerts_enabled: false` when the switch is off, and the messages unchanged by trimming (`'  text '` stays); with the defaults the body has `alerts_enabled: true` and both messages `''` (FR-20, FR-65).
- "Changed" is false at the start; true with the switch off, true with a message of one space, true with text; false again when the switch is back on and both messages are `''`.

**The form (`AddServiceForm.test.tsx`, `AlertsGroup.test.tsx`)**

- Idle: the `Alerts` group shows after the Request group with the switch `Send alerts` on and described by its hint, `Off`/`On` in words, two text areas labelled `Unhealthy message (optional)` and `Recovery message (optional)` (found by `getByLabelText` with their labels), each with the placeholder, three rows, no `maxlength`, counters `0/500` and `0/500`; the footer status is still empty; the buttons are still `Cancel` and `Save service` (FR-20, FR-65).
- Typing 12 characters in one text area shows `12/500` there and `0/500` on the other; an emoji counts as one; a paste of 501 characters is kept whole and shows `501/500`; pasting 500 characters shows `500/500` and no error.
- Send: with nothing touched the body is the old three keys plus `alerts_enabled: true`, `unhealthy_message: ''`, `recovery_message: ''`; with the switch turned off and both messages typed (`'  down '` and `<b>x</b>`) the body has `alerts_enabled: false` and both messages exactly as typed; the messages are sent when alerts are off (FR-20, FR-65).
- In flight: the switch is disabled and both text areas are read-only, with the rest of the locked state as before; after a failure they are editable again.
- A `422` with `unhealthy_message` and `recovery_message` errors in that order: the summary lists `Unhealthy message: {message}` then `Recovery message: {message}`, each message shows under its text area with `aria-invalid` and `aria-describedby` pointing at it, each entry's link moves focus to its text area, and the summary has focus. A server message with markup shows as text (NFR-7). Two errors for one message show the first. Editing one text area removes only its error and its entry; editing the other removes the summary. A `422` for `settings` still lists plain text with no link and no field error (FR-12, FR-74).
- Leaving: turning the switch off makes the footer say `Unsaved changes`, Cancel opens the discard question and the unload prompt is armed; turning it back on empties the status and Cancel leaves at once; a message of one space counts as changed.
- Replaced on purpose: in `AddServiceForm.test.tsx`, the idle case "has no counter, no Type control, no switch and no test button" keeps its checks for Type, the radio group and the test button but no longer says there is no counter or no switch; the case "sends what was typed…" (`toStrictEqual` on the body) now expects the three new keys, and so does the generic-banner case "…Try again sends the same values and then navigates" (its second `toStrictEqual` on the body); `useCreateService.test.tsx` has a `toStrictEqual` on the body too and changes the same way. Nothing else is loosened.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged; the existing `Switch` cases pass unchanged.

## Verifier checks

- **By reading `AddServiceForm.tsx`, `AlertsGroup.tsx` and `useCreateService.ts`:** the body has the three new keys always; the messages are never trimmed on the client; there is no `maxlength` and no client check of the 500; the counter counts code points (not `.length`); the 500 is the named constant, used by the counter only; no `dangerouslySetInnerHTML`; messages are React text children.
- **By reading the components:** `Switch.tsx` has only the one new optional prop and its default render is unchanged; the root is named by the label element, not the whole wrapping label; `AlertsGroup` has no request code; no import from `features/alert-list` or `features/service-list`; icons from Lucide only; no literal colour or pixel value in a rule where a token exists.
- **Wording, by reading:** every string of the group is defined once and used from there, with the curly apostrophe in `service’s` as written.
- **Keyboard, by reading:** Tab order is Request fields, the switch, Unhealthy message, Recovery message, the footer; Space toggles the switch; each text area is a labelled control; each error is linked by `aria-describedby`; the summary keeps `tabindex="-1"`.
- **Contract:** the body matches `ServiceInput` (`alerts_enabled` boolean, the two messages strings); no status or code beyond those `add-service-screen` handled.
- **Mutation checks to run:** send `alerts_enabled: true` always; trim the messages before sending; drop the switch from "changed"; count `.length` instead of code points; map the wrong path to a text area; leave the text areas editable in flight; make the hint part of the switch's name. Each must fail at least one named test.
- **Inputs to try:** a message of exactly 500, 501, and 500 plus spaces; an emoji message; a message with a line break; both messages in error; one in error and the switch off; a `422` followed by editing a message; the switch off then on; a message of one space then Cancel; saving with alerts off; a `422` with `alerts_enabled` as a path (plain text, no link).

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design board or this file conflict with each other.
- You think you need a change outside your paths, a dependency, an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- `add-service-screen` is not merged, or a name this file takes from it is missing.
- The `Switch` cannot be named by its label and described by its hint without changing a rule of an existing case.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
