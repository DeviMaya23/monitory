# Task: service form type switch and TCP fields

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

On the Add service screen (`/services/new`) the admin can choose the service's type, HTTP(S) or TCP port, as the board's "Type" control draws it. Choosing TCP port swaps the Request, Health rules and HTTPS groups for one group, `TCP port`, with a Host and a Port; the Timing and Alerts groups stay. The HTTP values stay in the form while TCP is chosen, so switching back loses nothing, and only the chosen type is sent. The values are sent with `createService` as a TCP check (`{ type: 'tcp', host, port }`), and the server's refusals appear on the Host and Port fields and in the error summary. Until now the form can only add an HTTP(S) service.

Requirements covered:

- FR-33: a service is added as one of two types, HTTP(S) or TCP port.
- FR-49, in part: the admin enters the host and port of a TCP port check (the probe is built and merged, `tcp-probe`).
- FR-52, in part: a TCP service has the same timing settings (timeout, retries, retry interval), set in the Timing group that stays on screen.
- FR-74, in part: a TCP service with no host (`required`) or a port outside 1 to 65535 (`out_of_range`) is refused by the server and its message is shown on the field; a port that is not a whole number is refused on the client (see "Client checks").
- FR-12, in part: the `422` errors for the TCP paths are shown on their fields and in the summary.
- NFR-4, in part: the Type choice, Host and Port are reachable by Tab in the order of the form and operable from the keyboard.
- NFR-7: the host and every server message are shown as text.

Out of scope:

- **The edit form** (`getService`, `updateService`; FR-66's change of type on an existing service): not built; the edit-screen task builds the same control and group from these.
- **The test panel** and the public-page switch: their own tasks.
- **The TCP probe, the runner and the scheduler:** built (`tcp-probe`); the screen only sends the settings.
- **A "TCP checks have no status code or body" result line:** it belongs to the test panel.
- **Any change to the server, the contract, the configuration or the design files.**

## Prerequisite

`service-form-json-and-cert-rows` and `service-form-request-rows` are merged. This file is drafted against the text of `service-form-json-and-cert-rows` (which was not merged when this was written); the builder checks first that these exist on the default branch, and stops to ask if any is missing or named differently (it never creates them):

- In `features/service-form/`: `components/AddServiceForm.tsx`, `RequestRowsGroup.tsx`, `HealthRulesGroup.tsx`, `HttpsGroup.tsx`, `TimingGroup.tsx`, `AlertsGroup.tsx`, `ErrorSummary.tsx`, `FieldErrorText.tsx`, `FormBanners.tsx`, `DiscardDialog.tsx`; `hooks/useRowFocus.ts`; `hooks/useCreateService.ts` (`ServiceFormValues` with the request, rule and certificate values), `useServerErrors.ts`, `useLeaveGuard.ts`; `lib/fieldLabels.ts`, `fieldIds.ts`, `requestRows.ts`, `jsonRules.ts`, `certificateOptions.ts`, `timingGroup.ts` (the whole-number reader and `Enter a whole number.`); `service-form.css`; and their tests.
- `components/ui/RadioGroup.tsx` (props `label`, `value`, `onValueChange`, `options` of `{ value, text }`, `disabled`, `id`).
- `lib/api/services.ts` with `createService(input: ServiceInput)`; the generated `ServiceInput` whose `check` is either the http check or `{ type: 'tcp', host: string, port: integer }`.
- In `styles/components.css`: `.group`, `.group__legend`, `.grid`, `.field`, `.label`, `.input`, `.input--mono`, `.hint`, `.error-text`.

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/service-form/**`, `frontend/src/test/fixtures.ts` (only if a helper is missing) and, in `frontend/src/App.test.tsx`, only an assertion on the `createService` request body if it needs one. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `frontend/src/styles/components.css`, `frontend/src/components/**` (including `components/ui/**`), `backend/**`, or `docs/**` (except your own plan file, `docs/tasks/service-form-type-tcp.plan.md`). Do not change `features/alert-list/**`, `features/service-list/**` or `features/sign-in/**`.

Shared files this task touches, and who owns each: everything under `features/service-form/` is owned by this task while it runs. Tasks that may run at the same time: any backend task and `target-dialog-test-flake`. The edit-screen task and the test-panel task build in the same feature and wait for this one.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `createService` | `POST /api/services` | As the screen already handles them (201, 422, 409 `service_name_taken`, 409 `service_limit_reached`, 413, 403 `csrf_failed`, 401, anything else); no new status or code. Real on the server. |

The request's `check` becomes `{ type: 'tcp', host, port }` for a TCP service (the contract's `TcpCheck`: `host` a non-empty string, `port` an integer 1 to 65535). The server answers `422 validation_failed` with errors whose `field` is (codes and messages as the server sends them; one field gets at most one error): `check.host` (`required`, `Enter a host.`), `check.port` (`out_of_range`, `Must be between 1 and 65535.`), and for a type the server does not know, `check.type` (`required` or `invalid_value`; the form always sends one of the two). The Timing and Alerts paths are as before.

## Behavior

### What exists

The form has the groups Service (name), Request, Health rules, HTTPS, Timing and Alerts, with the discard question, the `422` error summary (a path with no input is listed as plain text, a path with an input links to it), the banners and the footer. `useCreateService` always sends an HTTP check. The URL field has the client check `Enter a URL.` (`register('url', { validate })`), and the days field has its own client check while the expiry switch is on.

### The Type control

In the Service group, after Name, a field with the `RadioGroup` wrapper: label `Type`, id `service-type`, options `HTTP(S)` (value `http`) and `TCP port` (value `tcp`), starting at `HTTP(S)`, and below it `p.hint` `Changing type swaps the fields below.` While a save is in flight it is disabled. Changing it moves no focus (it stays on the chosen radio). The form's value is named `type`.

### What each type shows

- **HTTP(S):** the groups in the order Service, Request, Health rules, HTTPS, Timing, Alerts, as before.
- **TCP port:** the groups Service, TCP port, Timing, Alerts. The Request, Health rules and HTTPS groups are not rendered.

Values of the groups that are not rendered stay in the form's state (the typed URL, method, rows, body, rules, switches and days), so choosing HTTP(S) again shows them as they were, and a TCP host and port stay when HTTP(S) is chosen. Nothing of the hidden type is sent.

### The TCP port group

A `fieldset.group` with the `legend.group__legend` `TCP port`, holding a two-column grid as the board draws it (a `div.url-row` with the columns `minmax(0, 1fr) 140px`, Host wide and Port narrow; at the compact width one column, as `.url-row` already does) with two fields:

| Field | Label | Control | Starts at |
|---|---|---|---|
| Host | `Host` | `input.input.input--mono`, `type="text"`, id `service-host`, placeholder `db.internal or 10.0.0.12` | empty |
| Port | `Port` | `input.input.input--mono`, `type="text"`, `inputmode="numeric"`, id `service-port`, placeholder `5432`, with the hint `1 to 65535` (`p.hint`, linked by `aria-describedby` while there is no error) | empty |

An error replaces the hint under its field as `FieldErrorText`, with `aria-invalid="true"` and `aria-describedby` on the input. While a save is in flight both are read-only. The hint `1 to 65535` is fixed text, the port range of FR-74, not a deployment limit.

### Client checks

- The URL's client check (`Enter a URL.`) and the days' client check run only while the type is HTTP(S): a TCP service with an empty URL field is not refused on the client. Inputs that are not rendered are not validated, and a client error left on a field of the type that was just hidden (`Enter a URL.`, the days') is cleared when the type changes, so it does not come back when that type is chosen again.
- On submit with TCP chosen, the port text, trimmed, must be one or more digits and not more than `Number.MAX_SAFE_INTEGER` (the reader in `lib/timingGroup.ts`); otherwise `Enter a whole number.` shows under Port, focus goes to the first invalid field of the whole form in the order of the form, nothing is sent, and the message goes when the input is edited or the type is changed. An empty port is not a whole number. Everything else (an empty host, `0` or `70000`) is the server's. The host has no client check.
- The timing checks run for both types, as before.

### What is sent

For HTTP(S): exactly what the form sends today. For TCP port: `check` is `{ type: 'tcp', host, port }` with `host` as typed (the server trims it) and `port` the trimmed text as an integer; none of the HTTP keys is present. `name`, the alert fields and `settings` are sent as before.

### Failures

For a `422`:

- `check.host` and `check.port` are mapped paths: in the summary `Host: {message}` and `Port: {message}`, each a link that moves focus to its input; the same message shows under the input. `check.type` is listed as plain text `Type: {message}`, no link and no input marked invalid (the control cannot be wrong from the form). Every other path behaves as before.
- Each message is the server's `FieldError.message` as it is. Focus after a `422` stays on the summary.
- Editing the host removes `check.host`'s error and entry; editing the port removes `check.port`'s.
- **Changing the type removes every error and entry whose path starts with `check.`** (they were answered for the other type, so none can be trusted, and many point at inputs that are no longer on screen); the errors of the name, the settings and the two messages stay.

Every label, hint and message is rendered as text (NFR-7).

### Leaving without saving

The form counts as **changed** (the footer says `Unsaved changes`, Cancel and the back link ask, and the browser's unload prompt is armed) when, as before, any existing value differs from its start, and now also when the type is `TCP port`, the host text is not empty or the port text is not empty (also while HTTP(S) is chosen). Putting everything back makes the form unchanged.

### Decisions

- **The type is a `RadioGroup`** (the segmented look the board draws), the existing wrapper.
- **Changing the type clears every `check.*` server error:** the board does not say; leaving them would show entries whose input is gone and whose link moves focus nowhere (the same problem is tracked for the target dialog). The user may overrule.
- **A port that is not a whole number is refused on the client** with `Enter a whole number.` (as the timing fields), because the form cannot send it as an integer; the range is the server's.
- **The HTTP values are kept** while TCP is chosen (the board says so), and the TCP values while HTTP(S) is chosen.
- **The wording not on the board** (decided here): the summary label `Type` for `check.type`, `Host` and `Port` for their entries.

### Known gaps

- **No range is checked on the client:** `0` and `70000` are sent and refused by the server with its message.
- **The edit form does not have the Type control or the TCP group yet,** so a service's type cannot be changed (FR-66) until the edit-screen task.
- **The test panel does not exist yet:** the admin cannot try the connection from the form.

## Structure

By `ARCHITECTURE.md` and `CONVENTIONS.md`. Names marked "new" do not exist yet and are fixed by this file; others are the builder's choice. One hook per concern, each with a colocated test written in the same step.

- `features/service-form/lib/serviceType.ts` (new, with a test): the type options and their texts, the default (`http`), the Type words (`Type`, the hint), ids (`service-type`, `service-host`, `service-port`), the server paths (`check.host`, `check.port`, `check.type`), the TCP words (`TCP port`, `Host`, `Port`, `1 to 65535`), and the function that builds the TCP `check` from the host text and the port as a number (the form reads the port text with the whole-number reader first; the function is never given an unparseable port).
- `features/service-form/lib/fieldLabels.ts` and `fieldIds.ts` (and tests): `check.host` and `check.port` map to their labels with their inputs and ids; `check.type` maps to `Type` with no input; any other unknown path still maps to itself with no input. Every test that used `check.type` as the example of an unmapped path ("lists an unmapped path as plain text…" in `AddServiceForm.test.tsx`, the Alerts-group test that sends it, the `maps %s to itself` list in `fieldLabels.test.ts`, the case in `useServerErrors.test.tsx`, and any other) now uses a path that stays unmapped, `check.unknown`.
- `features/service-form/hooks/useServerErrors.ts` (and test): clear the entries of host and port by their paths, and a way to clear every path that starts with `check.` at once, an unknown one included (a type change; a prefix marker in the same "cleared paths of one response" mechanism, the builder's shape).
- `features/service-form/hooks/useCreateService.ts` (and test): `ServiceFormValues` gains `type`, `host`, `port` (text); the body is the HTTP check as before or the TCP check from `lib/serviceType.ts`.
- `features/service-form/hooks/useLeaveGuard.ts` (and test): takes the new values; "changed" as above.
- `features/service-form/components/TypeField.tsx` and `TcpGroup.tsx` (new, each with a test), or the equivalent: each takes from the form what `TimingGroup` and `AlertsGroup` take (`control`, `register`, `saving`, the messages, the clear functions) and holds no request logic.
- `features/service-form/components/AddServiceForm.tsx`: places the Type field in the Service group, renders the HTTP groups or the TCP group by the type, adds the default values, runs the URL and days checks only for HTTP(S), runs the port check for TCP, passes the errors and the clear functions, and clears the `check.*` errors when the type changes.
- `features/service-form/service-form.css`: only what the new parts need that the file lacks: the TCP group's column override (`minmax(0, 1fr) 140px` on `.url-row` for this group, its compact-width rule being the existing one), with values from `docs/design/service-form.css`.

## Design reference

Reference only, read-only: `docs/design/service-form.html` ("Add service: TCP port", "Add service: idle (HTTP)" for the Type control, "Field errors: rows and ranges" for the Port error, and the validation wording table) with `docs/design/service-form.css` and `components.css`. Copy values and rules from the styles; never copy board markup or component code. Build with the existing wrappers and Lucide icons. Where the board and the contract disagree the contract wins; the differences are in "Decisions" and `docs/design/README.md`. The board's "Run test" panel and its TCP result are the test-panel task's.

Texts copied from the board as written: `Type`, `HTTP(S)`, `TCP port`, `Changing type swaps the fields below.`, `Host`, `Port`, `1 to 65535`, and the placeholders `db.internal or 10.0.0.12` and `5432`. The board's `required` attribute on the Host input is not carried over: the host has no client check, the server's `required` is shown.

## Dependencies

None. `react-hook-form`, `lucide-react` and `@base-ui/react` are installed; `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Mock `createService` at the wrapper boundary as `AddServiceForm.test.tsx` does, keeping the real query key; use the `problem`, `validationProblem` and `fieldError` fixtures; use `user-event`.

**`lib/serviceType.ts`, `useCreateService`, `useLeaveGuard`**

- The TCP check for host `db.internal` and port ` 5432 ` is `{ type: 'tcp', host: 'db.internal', port: 5432 }` (the host as typed, the port as an integer); with TCP chosen the `check` of the request equals `{ type: 'tcp', host, port }` exactly (asserted with a strict equality, so no `method`, `url`, `query_params`, `headers`, `body`, `json_rules`, `json_rule_mode`, `certificate_check` or `ignore_certificate_errors` key can be present), whatever was typed in those groups before; the `settings` sent with it are the Timing group's values (non-default ones, such as `45`, `5`, `0`, `1`, are sent as typed: FR-52); with HTTP(S) chosen the request is as before and has no `host` or `port` (FR-33, FR-49).
- "Changed" is false at the start; true with the type `tcp`, with a host, with a port (also while HTTP(S) is chosen); false again when everything is put back.
- Ids, paths and labels: `check.host` and `check.port` map to `Host` and `Port` with inputs and ids; `check.type` maps to `Type` with no input; `check.unknown` and `toString` map to themselves with no input.

**`useServerErrors`**

- Clearing the host removes only its entry; clearing the port, only its; clearing every `check.` path removes the entries of the method, URL, request rows, body, rules, rule mode, certificate, host, port, type and an unknown `check.` path, and leaves `name`, the timing paths and the two messages; another response starts with nothing cleared.

**The form (`AddServiceForm.test.tsx`, `TypeField.test.tsx`, `TcpGroup.test.tsx`)**

- Idle: the Service group shows `Type` with `HTTP(S)` chosen and the hint `Changing type swaps the fields below.` after Name; the groups are Service, Request, Health rules, HTTPS, Timing, Alerts; there is no TCP group and no Host or Port (FR-33).
- Choosing `TCP port`: the groups become Service, `TCP port`, Timing, Alerts; Host and Port show empty, Port with the description `1 to 65535`; the Request, Health rules and HTTPS groups and their controls are gone; focus stays on the chosen radio; the Timing and Alerts groups keep their values (FR-33, FR-52).
- Keeping values: type a URL, one query row, a rule and turn the ignore switch on with an `https://` URL, choose TCP port, type a host and port, choose `HTTP(S)`: the URL, the row, the rule and the switch are as they were, and the TCP host and port are still there when TCP is chosen again.
- Send: with TCP chosen, host `db.internal` and port ` 5432 ` typed, and an empty URL field, the request is `check: { type: 'tcp', host: 'db.internal', port: 5432 }` with the name, alert fields and `settings` as before and nothing is refused on the client for the empty URL; with HTTP(S) chosen again and a URL typed, the request is the HTTP check as before (FR-33, FR-49).
- Client check: with TCP chosen, a port of `''`, `abc`, `1.5` or `-3` shows `Enter a whole number.` under Port, focus goes to the first such field in the order of the form, nothing is sent, editing the port clears it and so does changing the type; `0` and `70000` are sent (the server refuses them); an empty host is sent (FR-74).
- In flight: the Type choice, Host and Port are disabled or read-only and are editable again after a failure.
- A `422` with `check.host` and `check.port` while TCP is chosen: the summary lists `Host: …` and `Port: …` in the order sent, each a link that moves focus to its input, each message shows under its input with `aria-invalid` and `aria-describedby` (the port's message replaces the hint), and the summary has focus; a message with markup shows as text (NFR-7).
- A `422` with `check.type`: plain text `Type: …`, no link, no input marked invalid.
- Focus order: with TCP chosen, a bad port and a bad timing field together focus Port (it comes before Timing on the page); after choosing TCP and then HTTP(S) again, an empty URL and a bad timing field together focus the URL, not the timing field. (The form library focuses the first invalid field by registration order, and groups that mount later register later; the builder must make focus follow the order on the page, for example by turning its default focus off and focusing the first invalid field by document order in the submit's invalid handler, for the new groups and the old.)
- Hidden inputs are not checked: with TCP chosen and an empty URL field the save is not refused on the client, and a days error or a URL error left from HTTP(S) does not reappear until HTTP(S) is chosen and a submit runs again.
- Clearing: editing the host clears its error only; editing the port clears its error only; changing the type clears every `check.*` entry (a URL error, a row error, a host error) and keeps a `name` error and a timing error; the last removal removes the summary.
- Leaving: choosing TCP port, or typing a host or port, makes the footer say `Unsaved changes`, Cancel opens the discard question and the unload prompt is armed; putting everything back empties the status and Cancel leaves at once.
- Tab order: Name, then the Type choice (one stop; arrow keys move the choice), then with HTTP(S) Method; with TCP Host, Port, then Check interval (NFR-4).
- Replaced on purpose, all in the files named: (1) the idle test titled "has no Type control and no test button" now expects the Type control (and still no test button); the cases that count radio groups and radios expect the new count (the `Type` group adds one radio group and two radios on top of the json-and-cert state: three groups and eight radios; the button lists are unchanged). (2) Every test that uses `check.type` as the unmapped path (today `AddServiceForm.test.tsx` twice, `fieldLabels.test.ts` and `useServerErrors.test.tsx`, and any the json-and-cert task adds) uses `check.unknown` (see "Structure"). (3) The existing Tab-order tests start at the URL field and need no change; only the new Name, Type, Method or Host test is added. (4) Every test that asserts the HTTP request's `check` is unchanged (the HTTP request has no new key); typed fixtures get the new values: `useCreateService.test.tsx`'s `VALUES` and the `Harness` of `useLeaveGuard.test.tsx`. Nothing else is loosened.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

## Verifier checks

- **By reading `useCreateService.ts`, `lib/serviceType.ts` and `AddServiceForm.tsx`:** the TCP request has only `type`, `host` and `port` in `check`; the HTTP request has no new key; the URL and days checks are skipped for TCP; the port is the only new client check; the host is never checked on the client; no range is checked on the client; no server message is rewritten.
- **By reading the components:** no import from `features/alert-list`, `features/service-list` or `features/sign-in`; `components/**` unchanged; icons from Lucide only; Base UI only imported inside `components/ui/`; every string defined once; no literal colour or pixel value where a token exists; the hidden groups are not rendered (their inputs are not in the DOM) while their values stay in the form's state.
- **Keyboard, by reading:** the order for HTTP(S) is Name, Type, Method, URL, …; for TCP Name, Type, Host, Port, then the four timing inputs, the alert switch and messages, the footer; every control has an accessible name; each error is linked by `aria-describedby`, except `check.type`'s.
- **Contract:** the TCP `check` matches `TcpCheck` (`host` string, `port` integer); no status or code beyond those the screen already handles.
- **Mutation checks to run:** send the HTTP keys with a TCP check; send the port as text; skip the trim of the port; run the URL check for TCP; drop the port check; check the host on the client; render the HTTP groups for TCP (hidden by CSS only); drop the HTTP values when switching type; leave `check.*` errors after a type change; clear the `name` error on a type change; map `check.port` to the host's input or label; make `check.type` a link; drop a new value from "changed". Each must fail at least one named test.
- **Inputs to try:** a host with spaces and markup; ports `0`, `1`, `65535`, `65536`, ` 80 `, `8o`, `9999999999999999999999`; switching type five times with values in both; a `422` with errors on the URL, a row, the host and the port, then switching type; the type switch while a save is in flight.
- **What the verifier cannot prove:** the look at 360 px and a real server's messages; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design board or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a shared component or a change to a `components/ui/` wrapper, an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- `service-form-json-and-cert-rows` is not merged, or a name this file takes from it is missing.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
