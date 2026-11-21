# Task: service form JSON rules and certificate options

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

On the Add service screen (`/services/new`) the admin can give an HTTP(S) service health rules and certificate options, as the board's "Health rules" and "HTTPS" groups draw them. Health rules are up to a configured number of JSON rules (a field path and a failing value that is text, `true` or `false`) with the choice of "any rule matches" or "all rules match". The HTTPS group has the certificate-expiry check (a switch and a minimum number of days) and "ignore certificate errors", both available only while the URL starts with `https://`. The values are sent with `createService` as the check's `json_rules`, `json_rule_mode`, `certificate_check` and `ignore_certificate_errors`, and the server's refusals appear on the rows and in the error summary.

Requirements covered:

- FR-44: the admin defines several JSON rules, each a field and a failing value that is text or true/false.
- FR-46: a field inside nested JSON is named with dots; the board's hint shows the example `checks.db.status` (the screen does not parse the path).
- FR-47: one setting decides whether the rules fail the check when any rule matches or only when all match (`Mark unhealthy when`).
- FR-69, in part: the limit of rules is the server's. A save over it is refused and the message is shown under the rows; the screen enforces and shows no number.
- FR-34: the admin can turn on the certificate-expiry check of an HTTPS service.
- FR-50: when it is on, the admin sets the minimum days left; a value below the server's minimum is refused and the server's message is shown on the field.
- FR-64, in part: the admin can turn on "ignore certificate errors" for an HTTPS service (off by default).
- FR-74, in part: the screen does not offer the options for a URL that is not `https://`, and shows the server's `requires_https_url`, `required` and `out_of_range` messages, and a rule with no field (`required`), on their fields.
- FR-12, in part: the `422` errors for these paths are shown on their fields and in the summary.
- NFR-4, in part: every new input, switch, button and choice is reachable by Tab in the order of the form and operable from the keyboard; Add and Remove move focus as on the request rows.
- NFR-7: field paths, failing texts and every server message are shown as text.

Out of scope:

- **The edit form** (`getService`, `updateService`): not built; the edit-screen task builds the same groups from these.
- **The type switch and the TCP fields** (the groups here are for an HTTP(S) service; hiding them for TCP comes with `service-form-type-tcp`), the public-page switch, and the test panel: their own tasks.
- **Rule evaluation, the body read limit and the certificate probe:** built (`http-json-rules`, `http-certificate-options`); the screen only sends the settings.
- **Showing a number for any limit** ("Up to 10"): the limits are deployment configuration (`docs/design/README.md`); the server's message names it.
- **Telling an expired certificate from one close to expiry:** both are one failure code (a known gap of `http-certificate-options`).
- **Any change to the server, the contract, the configuration or the design files.**

## Prerequisite

`service-form-request-rows` is merged (it is). The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- In `features/service-form/`: `components/AddServiceForm.tsx`, `RequestRowsGroup.tsx`, `TimingGroup.tsx`, `AlertsGroup.tsx`, `ErrorSummary.tsx`, `FieldErrorText.tsx`, `FormBanners.tsx`; `hooks/useCreateService.ts` (`ServiceFormValues`, `toFailure`), `useServerErrors.ts` (with `errorFor`, `bareError`, `clearField`, `clearList`, `clearRows`, `clearBodyType`, `groupError`), `useLeaveGuard.ts`; `lib/fieldLabels.ts` (`FieldTarget`, `StaticTarget`, `BarePath`, `fieldLabel`, `isBarePath`, `summaryTitle`), `lib/fieldIds.ts` (`FIELD_IDS`, `fieldId`, `focusField`, `errorId`), `lib/requestRows.ts` (`requestParts`, `rowInputId`, `parseRowPath`), `lib/timingGroup.ts` (the whole-number reader and `Enter a whole number.`); `service-form.css`; and their tests.
- `components/NameValueRows.tsx`, `components/ui/Select.tsx` (props `id`, `label`, `value`, `onValueChange`, `options`, `disabled`, `invalid`, `aria-describedby`; it renders a visible `label.label` before the trigger), `components/ui/RadioGroup.tsx`, `components/ui/Switch.tsx` (props `checked`, `onCheckedChange`, `label`, `disabled`, `description`).
- `lib/api/services.ts` with `createService(input: ServiceInput)`; the generated `ServiceInput` whose http `check` has `json_rules` (`{ field, failing_value: string | boolean }[]`), `json_rule_mode` (`'any' | 'all'`), `certificate_check` (`{ enabled, min_days_left? }`) and `ignore_certificate_errors`.
- In `styles/components.css`: `.rows__head`, `.kv`, `.kv__cell`, `.kv__label`, `.rows__foot`, `.rows__empty`, `.group`, `.group__legend`, `.group__desc`, `.stack`, `.switch-row`, `.input-group`, `.input-group__addon`, `.notice`, `.notice--muted`, `.sr-only`, `.hint`, `.error-text`, `.segmented`.

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/service-form/**`, `frontend/src/test/fixtures.ts` (only if a helper is missing) and, in `frontend/src/App.test.tsx`, only the assertion on the `createService` request body. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `frontend/src/styles/components.css`, `frontend/src/components/**` (including `components/ui/**` and `NameValueRows.tsx`), `backend/**`, or `docs/**` (except your own plan file, `docs/tasks/service-form-json-and-cert-rows.plan.md`). Do not change `features/alert-list/**`, `features/service-list/**` or `features/sign-in/**`.

Shared files this task touches, and who owns each: everything under `features/service-form/` is owned by this task while it runs. `App.test.tsx` and `test/fixtures.ts` are touched only as stated. Tasks that may run at the same time: any backend task, and `target-dialog-test-flake` (it changes one test file in `features/alert-list/`). `service-form-type-tcp`, the edit-screen task and the test-panel task build in the same feature and wait for this one.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `createService` | `POST /api/services` | As the screen already handles them (201, 422, 409 `service_name_taken`, 409 `service_limit_reached`, 413, 403 `csrf_failed`, 401, anything else); no new status or code. Real on the server. |

The request's `check` gains `json_rules`, `json_rule_mode`, `certificate_check` and `ignore_certificate_errors`. The server answers `422 validation_failed` with errors whose `field` is (codes and messages as the server sends them; one field gets at most one error):

- `check.json_rules` (`too_many`), `check.json_rules[i].field` (`required`, a rule with no field after trimming) and `check.json_rules[i].failing_value` (`required`, sent only if the value is absent: the form always sends one);
- `check.json_rule_mode` (`invalid_value`);
- `check.certificate_check.enabled` (`requires_https_url`), `check.certificate_check.min_days_left` (`required`, `out_of_range`: `Must be 1 or more.`) and `check.ignore_certificate_errors` (`requires_https_url`).

`i` starts at 0.

## Behavior

### What exists

The form has the groups Service (name), Request (method and URL, query parameter rows, header rows, body type and body), Timing and Alerts, with the discard question, the `422` error summary (a path with no input is listed as plain text, a row path links to its input), the banners and the footer. `useCreateService` sends the name, the HTTP check with `query_params`, `headers` and an optional `body`, the alert fields and `settings`. `useServerErrors` tracks the errors of the last response minus the paths edited since, including "all rows of a list" and the bare list paths.

### The groups and their place

Two new `fieldset.group` blocks between the Request group and the Timing group, in this order: **Health rules**, then **HTTPS**. (The order of the form is therefore Service, Request, Health rules, HTTPS, Timing, Alerts.)

### Health rules

`legend.group__legend` `Health rules` followed by `<span class="label opt">(optional)</span>`, then `p.group__desc` `The response is parsed as JSON. A rule matches when the value at the field path equals the failing value.`, then the rows block, then the mode choice.

**The rows block** (`div.rows`):

- With no rule: `p.rows__empty` `No JSON rules. Any 2xx response counts as healthy.`
- With rules: a header line (`aria-hidden`) with the words `Field path`, `Failing value`, `Text` and an empty cell, then one row per rule in the order added.
- Below, `div.rows__foot` with the button `Add rule` (Lucide `Plus`, as `NameValueRows`' Add button) and the hint `Path example: checks.db.status` with the path in a mono span (the board's `Up to 10.` is left out, see "Decisions").
- A message about the list as a whole (`check.json_rules`) shows as `FieldErrorText` between the rows and the foot, as `NameValueRows` shows a list error.

**A rule row** (`div.rules-row`, a grid of four cells as the board: path, kind, text, Remove):

| Cell | Control | Name (accessible) | Notes |
|---|---|---|---|
| Field path | `input.input.input--mono`, id `service-rule-{i}-field` | `Rule {n} field path` (`aria-label`) | Text as typed; starts empty. `n = i + 1`. |
| Kind | the `Select` wrapper, trigger id `service-rule-{i}-kind`, options `Text` (value `text`), `true` (`true`), `false` (`false`), starting at `Text` | `Rule {n} failing value type` (the wrapper's `label`, hidden visually, see Structure) | The visible column word is `Failing value` in a `span.kv__label` (`aria-hidden`), shown at the compact width only. |
| Text | when the kind is `Text`: `input.input.input--mono`, id `service-rule-{i}-text`; otherwise `span.hint` `Not needed for true/false` | `Rule {n} failing text` (`aria-label`) | Text as typed; starts empty. Its visible column word is `Text` (`span.kv__label`, `aria-hidden`). |
| Remove | `button.btn.btn--ghost.btn--icon` with Lucide `Trash2` | `Remove rule {n}` (`aria-label`) | |

Add appends a rule with an empty path, kind `Text` and empty text, and moves focus to its path input. Remove deletes the rule and moves focus to the next rule's path input, or the previous rule's when the last went, or to `Add rule` when none is left (the same rule as `NameValueRows`, NFR-4). There is no limit on the client. While a save is in flight the inputs are read-only, the Select and the buttons are disabled.

A rule's errors: `check.json_rules[i].field` shows under that rule's path input (`FieldErrorText`, `aria-invalid="true"` and `aria-describedby` on the input); `check.json_rules[i].failing_value` shows as one message under the kind cell of that rule (`FieldErrorText`), with `aria-invalid` and `aria-describedby` on the kind's trigger; the text input gets neither.

**The mode choice:** a `RadioGroup` wrapper with the label `Mark unhealthy when`, id `service-rule-mode`, options `Any rule matches` (value `any`) and `All rules match` (`all`), starting at `Any rule matches`. It is shown always (also with no rules, as the board draws it). `check.json_rule_mode` (`invalid_value`) cannot arise from the form; if it comes it is listed in the summary as plain text (`Mark unhealthy when: {message}`) with no link.

### HTTPS

`legend.group__legend` `HTTPS`. The URL "starts with `https://`" when the URL field's text, with surrounding whitespace trimmed, begins with those eight characters in any letter case (as the server's check does). While it does not (this includes the empty URL):

- the group shows `p.notice.notice--muted` with the Lucide `Info` icon and the text `Available only when the URL starts with https://.`, and the group's `aria-describedby` names it (the board's note);
- both switches and the days input are disabled.

Inside, a `div.stack`:

1. **Check certificate expiry:** the `Switch` wrapper, label `Check certificate expiry`, description `Mark unhealthy when the certificate expires within the minimum days.`, starting off.
2. **Minimum days left**, in a `div.sub-switch` after the switch: a field with the label `Minimum days left` and an `input.input.input--mono` (`type="text"`, `inputmode="numeric"`, id `service-cert-days`) in an `input-group` with the addon `days` (`aria-hidden`), starting at `14` (the board's value, a named constant in the feature; the contract has no default). The input is disabled (the DOM `disabled` attribute, as the board draws it) unless the switch is on and the URL is `https://`; its text is kept in the form while it is disabled (the value is read from the form's state, not from the disabled element), so turning the switch off and on again, then saving, sends the kept text.
3. **Ignore certificate errors:** the `Switch` wrapper, label `Ignore certificate errors`, description `Accept invalid or self-signed certificates.`, starting off.

Errors: `check.certificate_check.min_days_left` shows under the days input (`FieldErrorText`, `aria-invalid`, `aria-describedby`); `check.certificate_check.enabled` and `check.ignore_certificate_errors` show as `FieldErrorText` under their switch row (a switch has no input to mark; the `Switch` wrapper is not changed).

**When the URL stops being `https://`** (the admin edits the URL field so that it no longer starts with `https://`): the certificate-expiry switch and the ignore switch are both set to off in the form, at the same moment, by the URL field's change handler, setting the form values (`setValue`) for the Controller-driven switches, only when the new URL does not start with `https://` (an edit from one `https://` URL to another leaves them as they are). The days text is not changed. Typing `https://` again does not turn them back on. (The user chose this over keeping them on and disabled.) So the form never holds a switch on with a URL that is not `https://`.

### Client checks

On submit, when the certificate-expiry switch is on, the days text, trimmed, must be one or more digits and not more than `Number.MAX_SAFE_INTEGER` (the reader in `lib/timingGroup.ts`); otherwise `Enter a whole number.` shows under the days input, focus goes to the first invalid field of the whole form in the order of the form, nothing is sent, and the message goes when the input is edited, when the expiry switch is turned off, and when the URL is edited. With the switch off, the days text is not checked. Everything else (a rule with no field, the minimum days, the number of rules) is the server's.

### What is sent

`check` gains, always:

- `json_rules`: one `{ field, failing_value }` per rule in order; `field` as typed (the server trims it); `failing_value` is the typed text, as typed with no trimming, for the kind `Text` (an empty text is sent as an empty string), `true` for `true`, `false` for `false` (booleans, not strings).
- `json_rule_mode`: `'any'` or `'all'`.
- `certificate_check`: `{ enabled: false }` while the switch is off (no `min_days_left`), `{ enabled: true, min_days_left: <integer> }` while it is on.
- `ignore_certificate_errors`: the switch's value (`false` or `true`).

Everything else is sent as before.

### Failures

For a `422`:

- A rule row path (`check.json_rules[i].field`, `check.json_rules[i].failing_value`) is a mapped path: in the summary `Rule {i+1} field path: {message}` and `Rule {i+1} failing value: {message}`, each a link that moves focus to the path input and to the kind's trigger; the message shows under its control as above.
- `check.json_rules` (list): the message shows under the rows; the summary entry is plain text `Health rules: {message}`, no link.
- `check.certificate_check.min_days_left`: summary `Minimum days left: {message}`, a link to the days input. `check.certificate_check.enabled` and `check.ignore_certificate_errors`: summary `Check certificate expiry: {message}` and `Ignore certificate errors: {message}`, plain text (a switch cannot take focus from a link here), the message under the switch.
- Each message is the server's `FieldError.message` as it is. Focus after a `422` stays on the summary. Every other path behaves as before.
- Clearing: editing a rule's path removes its `field` error and entry; editing a rule's kind or text removes its `failing_value` error; Add removes the list's own error; Remove removes the list's own error and every rule row error (the indexes shifted); changing the mode removes the mode error; editing the days removes the days error; turning a switch on or off removes that switch's error, and turning the expiry switch off also removes the days error; editing the URL field removes the two `requires_https_url` errors and the days error as well (their cause may be gone) besides the `check.url` error it removes today.

Every label, hint and message is rendered as text (NFR-7).

### Leaving without saving

The form counts as **changed** (the footer says `Unsaved changes`, Cancel and the back link ask, and the browser's unload prompt is armed) when, as before, any existing value differs from its start, and now also when there is at least one rule (even an empty one), the mode is `All rules match`, the expiry switch is on, the ignore switch is on, or the days text is not `14` (a space after `14` counts). Putting everything back makes the form unchanged.

### Decisions

- **The HTTPS switches turn off when the URL stops being `https://`,** by the user's decision (the board describes the other choices; the board's note about the server still answering `requires_https_url` stays true for a server that is stricter or a form that is bypassed).
- **The mode uses the `RadioGroup` wrapper** (the segmented look), not the board's stacked plain radios, because `STACK.md` forbids a hand-written replacement for a primitive the wrapper provides and the Body type already uses it. The user may list this in `docs/design/README.md` as a difference.
- **The rule's kind select is the `Select` wrapper** with its label hidden visually by a rule in `service-form.css` (the board shows a bare trigger with only an `aria-label`); the wrapper is not changed.
- **A rule with an empty failing text is sent** (an empty string): the server accepts it and the screen does not second-guess the rule.
- **The hints with numbers are dropped** (`Up to 10.` becomes `Path example: checks.db.status`), as for the request rows.
- **The days field starts at `14`** as the board shows it, as a named constant; the rows' focus effect is written once more in this feature (a small hook in `features/service-form/hooks/`) instead of sharing `NameValueRows`' (a new shared abstraction needs the user's approval); the backlog tracks the two copies.
- **Wording not on the board** (decided here): the summary labels `Health rules`, `Minimum days left`, `Check certificate expiry`, `Ignore certificate errors`, `Mark unhealthy when`, `Rule {n} field path`, `Rule {n} failing value`, and the hidden labels `Rule {n} failing value type`, `Rule {n} failing text`, `Remove rule {n}`.

### Known gaps

- **No limit shown:** the admin learns the rules' limit and the days' minimum from the server's message after a refused save.
- **A URL edited through a state that is not `https://`** (for example while typing the scheme) turns the switches off; the admin must turn them on again.
- **The groups show for every service,** because the type switch is not built yet (`service-form-type-tcp` hides them for TCP).
- **The edit form does not have these groups yet.**
- **The test panel does not exist yet:** the admin cannot try the rules from the form.

## Structure

By `ARCHITECTURE.md` and `CONVENTIONS.md`. Names marked "new" do not exist yet and are fixed by this file; others are the builder's choice. One hook per concern, each with a colocated test written in the same step.

- `features/service-form/lib/jsonRules.ts` (new, with a test): the rule kinds and their words, the mode options and words, ids (`service-rule-{i}-field`, `-kind`, `-text`, `service-rule-mode`), the server paths of each rule field, the labels (`Rule {n} field path`, and so on), and the function that turns the form's rules and mode into `json_rules` and `json_rule_mode` (the rule in "What is sent").
- `features/service-form/lib/certificateOptions.ts` (new, with a test): the starting days (`14`), the words, ids (`service-cert-days`), the server paths, a function that says whether a URL text starts with `https://` (trimmed, any letter case), and the function that builds `certificate_check` and `ignore_certificate_errors` from the form values.
- `features/service-form/lib/fieldLabels.ts` and `fieldIds.ts` (and tests): extend `FieldTarget` and the label and id mapping for the paths in "Operations used" (rule row paths carry an index, as the request rows' do): the rule `field` and `failing_value` and the days have an input; `check.json_rules`, `check.json_rule_mode`, `check.certificate_check.enabled` and `check.ignore_certificate_errors` have none (listed as plain text, with their labels); `check.type` and `toString` still map to themselves with no target.
- `features/service-form/hooks/useServerErrors.ts` (and test): the clearing in "Failures", over the same "cleared paths of one response" mechanism; no error is copied.
- `features/service-form/hooks/useRowFocus.ts` (new, with a test through a small harness, as `CONVENTIONS.md` asks for effects on DOM refs): moves focus after Add and Remove for the rule rows as in "A rule row".
- `features/service-form/hooks/useCreateService.ts` (and test): `ServiceFormValues` gains `json_rules` (`{ field: string; kind: 'text' | 'true' | 'false'; text: string }[]`), `json_rule_mode`, `cert_enabled`, `cert_days` (text), `ignore_cert_errors`; the body is built with the two lib functions; the client check of the days is part of the form's validation (as the timing checks are).
- `features/service-form/hooks/useLeaveGuard.ts` (and test): takes the new values; "changed" as above.
- `features/service-form/components/HealthRulesGroup.tsx` and `HttpsGroup.tsx` (new, each with a test), or the equivalent: each takes from the form what `TimingGroup` and `AlertsGroup` take (`control`, `register`, `saving`, the messages, the clear functions) and holds no request logic. The rules use `useFieldArray` on the form's `json_rules`.
- `features/service-form/components/AddServiceForm.tsx`: places the groups between Request and Timing, adds the new default values, passes the errors and the clear functions, and clears the switches in the URL field's change handler.
- `features/service-form/service-form.css`: the board's `.rules-row` grid (the four columns and the compact-width rules), `.sub-switch`, and a rule that hides the kind select's visible label inside a rule row with the same declarations as `.sr-only`; values copied from `docs/design/service-form.css`; nothing else.

## Design reference

Reference only, read-only: `docs/design/service-form.html` ("Add service: idle (HTTP)", "Edit service: every saved value shown (HTTP)" for the rule rows and the HTTPS group, "HTTPS options with an http:// URL", "Field errors: rows and ranges", and the validation wording table) with `docs/design/service-form.css` and `components.css`. Copy values and rules from the styles; never copy board markup or component code. Build with the existing wrappers and Lucide icons. Where the board and the contract disagree the contract wins; the differences are in "Decisions" and `docs/design/README.md`.

Texts copied from the board as written: `Health rules`, `(optional)`, the group description, `No JSON rules. Any 2xx response counts as healthy.`, `Add rule`, `Field path`, `Failing value`, `Text`, `true`, `false`, `Not needed for true/false`, `Mark unhealthy when`, `Any rule matches`, `All rules match`, `HTTPS`, `Available only when the URL starts with https://.`, `Check certificate expiry`, its description, `Minimum days left`, `days`, `Ignore certificate errors`, its description.

## Dependencies

None. `react-hook-form`, `lucide-react` and `@base-ui/react` are installed; `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Mock `createService` at the wrapper boundary as `AddServiceForm.test.tsx` does, keeping the real query key; use the `problem`, `validationProblem` and `fieldError` fixtures; use `user-event`.

**`lib/jsonRules.ts` and `lib/certificateOptions.ts`**

- The rules become `json_rules` in order: a `Text` rule `{ field: ' a.b ', text: ' down ' }` is `{ field: ' a.b ', failing_value: ' down ' }` untrimmed; an empty text is `''`; `true` and `false` are the booleans `true` and `false`, whatever text was typed; no rules is `[]`; the mode passes through.
- `certificate_check` is `{ enabled: false }` when off even with days text; `{ enabled: true, min_days_left: 30 }` for `' 30 '` when on; `ignore_certificate_errors` is the switch's boolean.
- A URL text starts with `https://` for `https://a`, `HTTPS://a`, ` https://a` (leading space) and not for `http://a`, `https:/a`, ``, `ftp://a`, `xhttps://a`.
- Ids, paths and labels: rule `i` maps to its three ids and two paths; `fieldLabel` gives `Rule 3 field path`, `Rule 1 failing value`, `Minimum days left`, `Health rules`, `Mark unhealthy when`, `Check certificate expiry`, `Ignore certificate errors`, with an input for the rule paths and the days and none for the others.

**`useServerErrors`**

- Clearing a rule's field path removes only that entry; clearing its failing value, only that; "all rules of the list" removes the list's entry and every rule row entry and leaves the request rows' and the certificate entries; clearing the days leaves the switch entries; clearing the URL group removes the two `requires_https_url` entries and the days entry; another response starts with nothing cleared.

**`useCreateService` and `useLeaveGuard`**

- With nothing touched the `check` has `json_rules: []`, `json_rule_mode: 'any'`, `certificate_check: { enabled: false }` and `ignore_certificate_errors: false` next to the existing keys; with two rules, mode `all`, the switch on and `45` typed, the request has them as in "What is sent" (FR-44, FR-47, FR-34, FR-50, FR-64).
- "Changed" is false at the start; true with one rule (even empty), with mode `all`, with the expiry switch on, with the ignore switch on, with the days text `14 ` and with `7`; false again when everything is put back.

**The form (`AddServiceForm.test.tsx`, `HealthRulesGroup.test.tsx`, `HttpsGroup.test.tsx`)**

- Idle: after the Request group and before Timing, `Health rules (optional)` shows with its description, `No JSON rules. Any 2xx response counts as healthy.`, `Add rule`, the hint `Path example: checks.db.status`, and `Mark unhealthy when` with `Any rule matches` chosen; `HTTPS` shows with the note `Available only when the URL starts with https://.`, both switches off and disabled, and `Minimum days left` at `14`, disabled; the footer status is empty (FR-44, FR-47, FR-74).
- Rules: `Add rule` adds a row whose `Rule 1 field path` input has focus, with `Rule 1 failing value type` showing `Text` and `Rule 1 failing text` present; choosing `true` replaces the text input with `Not needed for true/false` and the field path and the type stay; choosing `Text` again shows the text input holding what was typed before (type `abc`, choose `true`, choose `Text`: the input holds `abc`; the text is kept in the form while the kind is `true` or `false`, and not sent); Remove moves focus to the next row's path, the previous row's when the last went, and to `Add rule` when none is left; there is no limit on the client (21 rules can be added) (NFR-4).
- Send: with a `Text` rule `checks.db.status` / `down`, a `false` rule `ok` and a `true` rule `maintenance`, mode `All rules match`, the request has `json_rules` of `{ field: 'checks.db.status', failing_value: 'down' }`, `{ field: 'ok', failing_value: false }`, `{ field: 'maintenance', failing_value: true }` and `json_rule_mode: 'all'`; a rule with an empty path is sent as it is with no client error.
- HTTPS: with the URL `https://x.example.com` the note is gone and the switches are enabled; with `http://x.example.com` or an empty URL, the note shows and the switches and the days input are disabled; `HTTPS://x` counts as https. Turning the expiry switch on enables the days input; turning it off disables it and keeps its text.
- The URL change turns the switches off: with `https://x` and both switches on, changing the URL to `http://x` sets both off (the request then has `certificate_check: { enabled: false }` and `ignore_certificate_errors: false`), and typing `https://x` again leaves them off (FR-74).
- A days text kept while the switch is off is sent when it is turned on again: with `https://x`, `30` typed, the switch turned on, off and on, the request has `min_days_left: 30`.
- Staying on https: with `https://a` and both switches on, changing the URL to `https://b` leaves both on.
- Send: with `https://x`, the expiry switch on and `45` in the days, the request has `certificate_check: { enabled: true, min_days_left: 45 }`; with the ignore switch on, `ignore_certificate_errors: true`; with the expiry switch off and `abc` in the days, `{ enabled: false }` and no client error (FR-34, FR-50, FR-64).
- Client check: with the expiry switch on, days of `''`, `abc`, `1.5`, `-3` show `Enter a whole number.` under the days input, focus goes to the first such field in the order of the form, nothing is sent, and editing the days clears the message; the message also goes when the expiry switch is turned off and when the URL is edited; `0` is sent (the server refuses it).
- In flight: the rule inputs, the days and the body are read-only, the Select, the switches, the radios and the Add and Remove buttons are disabled, and editable again after a failure.
- A `422` with `check.json_rules[1].field` and `check.json_rules[0].failing_value`: the summary lists `Rule 2 field path: …` and `Rule 1 failing value: …` in the order sent, each a link that moves focus to the path input and the kind trigger, each message shows under its control with `aria-invalid` and `aria-describedby`, and the summary has focus. A message with markup shows as text (NFR-7).
- A `422` with `check.json_rules` (`too_many`): the message shows under the rows, the summary lists `Health rules: …` as plain text with no link, and no input is marked invalid.
- A `422` with `check.certificate_check.min_days_left`: the message shows under the days with `aria-invalid`, the summary entry `Minimum days left: …` links to the days input. A `422` with `check.certificate_check.enabled` and `check.ignore_certificate_errors`: each message shows under its switch, the summary lists `Check certificate expiry: …` and `Ignore certificate errors: …` as plain text with no link (FR-74).
- A `422` with `check.json_rule_mode`: plain text `Mark unhealthy when: …`, no link, no input marked invalid.
- Clearing: editing a rule's path clears only its error; changing its kind or text clears its `failing_value` error; Add rule clears the list's error; Remove clears the list's error and every rule row error and leaves the request rows' errors; changing the mode clears the mode error; turning a switch clears its own error, and turning the expiry switch off also clears the days error; editing the URL clears the two `requires_https_url` errors and the days error; the last removal removes the summary.
- `check.url` and a rule error together: both shown, cleared independently.
- Leaving: adding a rule, choosing `All rules match`, turning a switch on, or changing the days makes the footer say `Unsaved changes`, Cancel opens the discard question and the unload prompt is armed; putting everything back empties the status and Cancel leaves at once.
- Time: adding 21 rules with `user-event` in one case can be slow (see `target-dialog-test-flake`); use `fireEvent.click` for the bulk adds and keep any case near 1 s.
- Tab order: from the last request control (the Body type choice, or the Body text with a body), Tab goes to `Add rule` (with no rules), the `Any rule matches` and `All rules match` choice (one stop), then the expiry switch and the ignore switch (with `https://`; skipped while disabled), then Check interval; with one rule the order is path, kind, text, Remove, `Add rule`; the days input comes between the two switches while it is enabled (NFR-4).
- Replaced on purpose, all in the files named: (1) every test that asserts the `check` of the request with `{ type, method, url, query_params, headers }` in `AddServiceForm.test.tsx`, `useCreateService.test.tsx` and `App.test.tsx` now also expects `json_rules: []`, `json_rule_mode: 'any'`, `certificate_check: { enabled: false }` and `ignore_certificate_errors: false`. (2) The test that lists the group legends (`['Service', 'Request', 'Timing', 'Alerts']`) becomes `['Service', 'Request', 'Health rules (optional)', 'HTTPS', 'Timing', 'Alerts']` (builder: match the legend text as it renders). (3) The Tab-order tests that go from the Body type choice to Check interval now pass through the new controls (the hard-coded stop counts in the cases near `for (let stop = 0; stop < 3 + 4; …)` and `stop < 3`). (3a) The cases that count radio groups, radios and buttons: the test that expects exactly one `radiogroup` (the body's) now expects two (`Body type` and `Mark unhealthy when`); the lists of every button's text (the idle case and the Alerts-group case) gain `Add rule`; the case that expects four radios expects six; the cases that loop over all radios while saving include the mode radios and must find them disabled. (4) Typed fixtures: `useCreateService.test.tsx`'s `VALUES` and the `Harness` of `useLeaveGuard.test.tsx` get the new values. Nothing else is loosened.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

## Verifier checks

- **By reading `useCreateService.ts`, the two lib files and the groups:** every key of "What is sent" is always present; the failing value of `true`/`false` is a boolean; the text is untrimmed; `certificate_check` has no `min_days_left` while off; the only client check is the days' whole number while the switch is on; no limit, minimum or rule count is checked on the client; no server message is rewritten.
- **By reading the components:** no import from `features/alert-list`, `features/service-list` or `features/sign-in`; `components/**` unchanged; icons from Lucide only; Base UI only imported inside `components/ui/`; every string defined once; no literal colour or pixel value where a token exists, other than values copied from the design CSS; the switches are turned off in the URL field's change handler, not in an effect that sets state.
- **Keyboard, by reading:** the order in the form is Name, Method, URL, query rows, header rows, Body type, Body text, the rules (path, kind, text, Remove, then Add rule), the mode, the expiry switch, the days, the ignore switch, the four timing inputs, the alert switch and messages, the footer; every control has an accessible name; each error is linked by `aria-describedby`, except the list's error, the mode's, and the two switch errors (they have no control to describe); the summary keeps `tabindex="-1"`.
- **Layout, by reading the CSS (jsdom cannot prove it):** `.rules-row` is four columns at desktop and stacks at the compact width as the board's rules do; the hidden label does not take space; `.sub-switch` is indented.
- **Contract:** the keys and types match `ServiceInput.check` for `http`; no status or code beyond those the screen already handles.
- **Mutation checks to run:** trim the failing text; send `'true'` as a string; send `certificate_check` with days while off; send days as text; skip the URL change's switch reset; make the switches enable for `http://`; make `HTTPS://` not count; map `check.json_rules[1].field` to the wrong input or label (off by one); leave a rule error after editing; keep stale rule errors on Remove; drop the days error when the switch goes off; show the text input for `true`; drop a new value from "changed"; make the list error a link; make the mode error a link; allow a 21st rule to be refused on the client. Each must fail at least one named test.
- **Inputs to try:** 0, 1, 10 and 11 rules (11 is the server's refusal); an empty path; a path with dots, spaces and markup; a 5 000-character text; `true` after typing a text and back; days `0`, `1`, a 20-digit number; the URL typed character by character through `https://`; a `422` with errors on a rule, the list, the days and a switch at once; every Remove position.
- **What the verifier cannot prove:** the look at 360 px and a real server's limit messages; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design board or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a shared component or a change to a `components/ui/` wrapper (the user approved none beyond `NameValueRows`), an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- `service-form-request-rows` is not merged, or a name this file takes from it is missing.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
