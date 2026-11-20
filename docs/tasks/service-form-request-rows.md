# Task: service form request rows

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

On the Add service screen (`/services/new`) the admin can give an HTTP(S) service the rest of its request: query parameters, headers, and a body (none, JSON, plain text or URL-encoded form), as the board's Request group draws them. The values are sent with `createService` as the check's `query_params`, `headers` and `body`. The server's refusals (a row without a name, a list that is too long, a header value or body over its limit) appear on the rows and in the error summary. The header rows that the notification-target dialog already has are promoted to one shared component, and both screens use it; the query parameter rows are the same component with other labels.

Requirements covered:

- FR-37, in part: the admin sets a body of type none, JSON, plain text or form (URL-encoded) and its text.
- FR-35, in part (method and URL exist; this task adds query parameters, headers and the body): the saved request holds query parameters, headers and a body, and is sent as the form has them.
- FR-38, in part: the limits are the server's. A value over a limit is refused by `createService`, the error names the field and is shown on it, and nothing is saved; the screen enforces and shows no number (`docs/design/README.md`: the limits are deployment configuration).
- FR-12, in part: the `422` errors for the rows, the lists and the body are shown on their fields and in the summary.
- FR-39, in part: header values are shown in full in their inputs (no masking). The edit form is a later task; here it holds for the add form.
- NFR-4, in part: every row input, Add and Remove button, the body type choice and the body text are reachable by Tab in the order of the form and operable from the keyboard; Add and Remove move focus as the board describes.
- NFR-7: row names and values, the body text, and every server message are shown as text.

Out of scope:

- **The edit form** (`getService`, `updateService`): not built; the edit-screen task builds the same rows from these components.
- **JSON rules, certificate options, the type switch and TCP fields, the public-page switch, and the test panel:** their own tasks (backlog, Milestone 3).
- **Limits, counters and hints with numbers:** "Up to 20", "Up to 64 KB" and counters are not shown, because the limits are deployment configuration (`docs/design/README.md`); the server's message names the limit.
- **Promoting the discard dialog, the `422` summary with its server-error hook, the field-error text and the banners** to shared places: the user approved promoting the header rows only. Those stay as two copies (see the backlog line on `target-form-dialog`).
- **Rejecting a header name with a line break or a duplicate name on save:** no rule exists for a service's headers and none is added here (the `targets-api` backlog line tracks the same gap for webhook targets).
- **Any change to the server, the contract, the configuration or the design files.**

## Prerequisite

`service-form-timing`, `service-form-alerts`, `add-service-screen` and `target-form-dialog` are merged (they are). The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `features/service-form/` with `components/AddServiceForm.tsx`, `AlertsGroup.tsx`, `TimingGroup.tsx`, `ErrorSummary.tsx`, `FieldErrorText.tsx`, `FormBanners.tsx`, `hooks/useCreateService.ts` (with `ServiceFormValues`), `useLeaveGuard.ts`, `useServerErrors.ts`, `lib/fieldIds.ts` (`FIELD_IDS`, `focusField`, `errorId`), `lib/fieldLabels.ts` (`FieldTarget`, `fieldLabel`, `summaryTitle`), `lib/timingGroup.ts`, `service-form.css`, and their tests.
- `features/alert-list/components/HeaderRows.tsx` with its test, used by `TargetDialog.tsx`; `features/alert-list/lib/targetFields.ts` (`headerInputId`, `headerPath`, `fieldInfo`) and `features/alert-list/hooks/useTargetServerErrors.ts` with its `clearHeaders`.
- `components/ui/RadioGroup.tsx` (props `label`, `value`, `onValueChange`, `options` of `{ value, text }`, `disabled`, `id`).
- `lib/api/services.ts` with `createService(input: ServiceInput)`; the generated `ServiceInput` whose `check` (type `http`) has `query_params` (`{ name, value }[]`), `headers` (`{ name, value }[]`) and `body` (`{ type: 'none' | 'json' | 'text' | 'form', content? }`).
- In `styles/components.css`: `.rows__head`, `.kv`, `.kv__cell`, `.kv__label`, `.rows__foot`, `.rows__empty`, `.segmented`, `.textarea`, `.hint`, `.error-text`.

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/service-form/**`, `frontend/src/features/alert-list/**` (only to move the header rows out and use the shared one, see "Structure"), the new `frontend/src/components/NameValueRows.tsx` with its test, `frontend/src/styles/components.css` (only to receive the one rule moved from `alert-list.css`), `frontend/src/test/fixtures.ts` (only if a helper is missing) and, in `frontend/src/App.test.tsx`, only the assertion on the `createService` request body. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `frontend/src/components/ui/**`, `backend/**`, or `docs/**` (except your own plan file, `docs/tasks/service-form-request-rows.plan.md`). Do not change `features/service-list/**` or `features/sign-in/**`.

Shared files this task touches, and who owns each: everything under `features/service-form/` is owned by this task while it runs. `features/alert-list/` is touched only for the move. `App.test.tsx` and `test/fixtures.ts` may also be touched by another frontend task; the change here is one assertion, so a conflict is limited to neighbouring lines and the user resolves it when merging. Tasks that may run at the same time: any backend task (none touches `frontend/`). The later form tasks (JSON rules and certificate options, type and TCP fields, the edit screen, the test panel) wait for this one: they build in the same feature.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `createService` | `POST /api/services` | As the screen already handles them (201, 422, 409 `service_name_taken`, 409 `service_limit_reached`, 413, 403 `csrf_failed`, 401, anything else); no new status or code. Real on the server. |

The request's `check` gains `query_params`, `headers` and `body`. The server answers `422 validation_failed` with errors whose `field` is, for these parts (codes and messages as the server sends them; one field gets at most one error):

- `check.query_params` (`too_many`) and `check.query_params[i].name` (`required`, a row with no name);
- `check.headers` (`too_many`), `check.headers[i].name` (`required`, `too_long`) and `check.headers[i].value` (`too_long`);
- `check.body.type` (`invalid_value`) and `check.body.content` (`too_long`);
- `check.url` (`too_long`) also counts the query parameters, as the URL field already shows.

`i` starts at 0. A `413` is the 1 MB request limit, handled as today.

## Behavior

### What exists

The form has the groups Service (name), Request (method and URL), Timing and Alerts, with the discard question, the error summary for a `422` (paths with no input are listed as plain text), the banners and the footer. `useCreateService` sends the name, `check: { type: 'http', method, url }`, the alert fields and `settings`. The target dialog has its own `HeaderRows` (`features/alert-list/components/HeaderRows.tsx`).

### The Request group

The rows and the body are inside the existing Request `fieldset.group`, after the method-and-URL row, in this order. The URL's hint changes to `Starts with http:// or https://. Query parameters can go here or below.` (the board's text).

1. **Query parameters:** the shared rows component (below) with legend `Query parameters`, empty text `No query parameters.`, add button `Add parameter`, item name `Query parameter`, no hint.
2. **Headers:** the shared rows component with legend `Headers`, empty text `No headers.`, add button `Add header`, item name `Header`, and the hint `Values are shown in full.`
3. **Body type:** the `RadioGroup` wrapper with label `Body type`, id `service-body-type` and the options `None` (value `none`), `JSON` (`json`), `Plain text` (`text`), `Form (URL-encoded)` (`form`), starting at `None`.
4. **Body:** shown only while the body type is not `None`, after the Body type control: a field with the label `Body`, a `textarea.textarea` (monospace, as the board draws it) with the id `service-body-content`, `rows="6"` as the board draws it, the hint `Sent as entered.` (the `p.hint`, linked by `aria-describedby` while there is no error), and, when there is an error, the message under it as `FieldErrorText` with `aria-invalid="true"` and `aria-describedby` pointing at it. No placeholder, no counter, no `maxlength`. The text is kept in the form while the type is `None`, so switching away and back loses nothing, but it is not sent.

While a request is in flight (saving): every row input and the body text are read-only, the Add and Remove buttons and the Body type choice are disabled (as the shared component and `RadioGroup` already do with `readOnly` and `disabled`).

### The shared rows component

`frontend/src/components/NameValueRows.tsx` (new name; it is the promoted `HeaderRows`, with the user's approval to promote it; see "Structure"). It keeps every behavior of `HeaderRows` today: rows of two inputs (Name, Value) with a Remove button; when there are no rows the empty text; `Add` appends a row and moves focus to its Name input; Remove moves focus to the next row's Name input, or the previous row's when the last row went, or to the Add button when no row is left; a row's error under its input with `aria-invalid` and `aria-describedby`; a list error under the rows; `readOnly` locks the inputs and disables the buttons. What changes is that the words are props, so nothing is hardcoded to headers:

| Prop | Used for | Target dialog passes | Query parameters pass | Headers pass |
|---|---|---|---|---|
| `legend` (node) | the group's legend, class `label rows__legend` | `Custom headers` followed by `<span className="opt">(optional)</span>` | `Query parameters` | `Headers` |
| `emptyText` | shown with no rows | `No custom headers.` | `No query parameters.` | `No headers.` |
| `addLabel` | the Add button's text | `Add header` | `Add parameter` | `Add header` |
| `itemName` | the inputs' `aria-label` (`{itemName} {n} name` and `{itemName} {n} value`) and the Remove button's `aria-label` (`Remove {itemName in lower case} {n}`) | `Header` | `Query parameter` | `Header` |
| `hint` (optional string) | a `span.hint` inside `.rows__foot`, beside the Add button (as the board draws it), linked from the group by `aria-describedby` (with the list error's id when both are shown) | none | none | `Values are shown in full.` |

The other props stay as they are today (`rows`, `inputId`, `register`, `errorFor`, `listError`, `readOnly`, `onAdd`, `onRemove`). The ids of the list error and of the hint must be unique per instance (the page holds two lists): today `HeaderRows` hardcodes `header-rows-error`, which the shared component must replace with an id made per instance (for example from `useId`); no id may be shared by two lists. The component renders an error message itself as `p.error-text` with the `CircleAlert` icon and the message as text (the same markup as `FieldErrorText`), because it lives in `components/` and may not import from a feature; it does not import `features/*/components/FieldErrorText`. The words the target dialog shows do not change by one character.

### What is sent

`check` is `{ type: 'http', method, url, query_params, headers, body? }`:

- `query_params` and `headers` are always sent, as arrays of `{ name, value }` in the order of the rows, with the texts as typed: no trimming and no dropping of empty rows (the server trims, and refuses a row with no name with `check.query_params[i].name` / `check.headers[i].name` `required`). With no rows the arrays are empty.
- `body` is `{ type, content }` with the typed text as is when the type is `json`, `text` or `form`, and is left out when the type is `none`.

Everything else is sent as before. There is no client check for these parts: the server decides every limit and every refusal.

### Failures

For a `422`:

- A path of a row (`check.query_params[i].name`, `check.headers[i].name`, `check.headers[i].value`) is a mapped path: in the summary the entry is `{label}: {message}` with the label `Query parameter {i+1} name`, `Header {i+1} name` or `Header {i+1} value`, and it is a link that moves focus to that input; the same message shows under that input. Add and Remove on the same list clear that list's errors (below).
- A list path (`check.query_params`, `check.headers`): the message shows under that list's rows (the `listError` of the component); in the summary the entry is plain text with no link (`Query parameters: {message}`, `Headers: {message}`), like the target dialog's bare `headers`.
- `check.body.content`: the message shows under the Body text, with the summary entry `Body: {message}` as a link that moves focus to the text. `check.body.type`: plain text in the summary (`Body type: {message}`), no link (the choice cannot be wrong from the form; a server that disagrees is shown, not hidden).
- Each message is the server's `FieldError.message` as it is. Focus after a `422` stays on the summary. Every other path behaves as before, including an unknown one, which stays plain text.
- Editing a row input removes that input's error and entry. Adding a row removes the list's own error and entry. Removing a row removes the list's own error and **every** row error and entry of that list (the indexes have shifted, so they would point at other rows), as the target dialog does for headers. Typing in the Body text removes `check.body.content`; changing the Body type removes both `check.body.type` and `check.body.content`.

The `413` banner's second line changes to the board's text, now that the body and header values exist: `Together its fields are over 1 MB. Shorten the body or the header values.` (title unchanged: `The service is too large to save.`).

Every label, hint and message is rendered as text (NFR-7).

### Leaving without saving

The form counts as **changed** (the footer says `Unsaved changes`, Cancel and the back link ask, and the browser's unload prompt is armed) when, as before, any existing value differs from its start, and now also when there is at least one query parameter row or header row (even an empty one), when the body type is not `None`, or when the body text is not empty (even while the type is `None`). Removing the rows and clearing the body text puts the form back to unchanged.

### Decisions

- **One component for both row lists and the target dialog, named `NameValueRows`** (a rename of the promoted `HeaderRows`, since it also serves query parameters). The user approved promoting the header rows only; using it for query parameters is the same component with other words, not a second shared component. This file, when approved, approves the name.
- **Body text is not sent while the type is `None`,** but is kept in the form.
- **Both arrays are always sent,** possibly empty, so the later edit form (replace-all semantics) can use the same shape.
- **The body hint is `Sent as entered.`** (the board says `Up to 64 KB, sent as entered.`; the number is deployment configuration, so it is dropped as `docs/design/README.md` does for the other limits). The headers' hint drops `Up to 20.` for the same reason.
- **Wording not on the board** (decided here): the summary labels `Query parameters`, `Headers`, `Body type`, `Body` for the bare paths, and the plain-text summary entry for `check.body.type`.

### Known gaps

- **No limit shown:** the admin learns a limit only from the server's message after a refused save.
- **An empty row** is sent and refused by the server, not caught on the client.
- **The server's rule on header names** (line breaks, duplicates, headers the HTTP library controls) is not enforced on save for a service; this task does not add one.
- **The edit form does not have these rows yet.**
- **The test panel does not exist yet:** the admin cannot try the request from the form.

## Structure

By `ARCHITECTURE.md` and `CONVENTIONS.md`. Names marked "new" do not exist yet and are fixed by this file; others are the builder's choice. One hook per concern, each with a colocated test written in the same step.

- `components/NameValueRows.tsx` (new, with a test): moved from `features/alert-list/components/HeaderRows.tsx` with its test (the moved test keeps every case and adds the props above: another `itemName`, `emptyText`, `addLabel`, `hint` shown and linked, and the `aria-label` and Remove label wording). The old file and its test are deleted. `TargetDialog.tsx` imports the new component and passes the words from the table; its tests stay unchanged and must still pass with the same texts.
- `styles/components.css`: the rule `.header-rows__legend { margin-bottom: 6px; }` moves from `features/alert-list/alert-list.css` to `components.css` as `.rows__legend`, and the component uses that class; nothing else changes in either file.
- `features/service-form/lib/requestRows.ts` (new, with a test): the names and ids of the new parts: the element id of a query parameter or header row's input (`service-query-{i}-{name|value}`, `service-header-{i}-{name|value}`), the server path of each (`check.query_params[i].name`, and so on), and the labels (`Query parameter {n} name`, `Header {n} value`, `Body type`, `Body`, `Query parameters`, `Headers`); the body type options and their texts; a function that turns the form's values into the request's `query_params`, `headers` and `body` (the rule in "What is sent").
- `features/service-form/lib/fieldLabels.ts` and `fieldIds.ts` (and tests): the server-path type can no longer be a closed list, because the row paths carry an index. Extend `FieldTarget` (for example with template-literal types for the row paths) or replace it by a path with an optional input id, keeping every existing mapping and test; `fieldLabel` maps the paths in "Failures" to the labels there (`check.body.content` and the row paths have an input; `check.query_params`, `check.headers` and `check.body.type` have none), and anything else still maps to itself with no input. `FIELD_IDS` and `focusField` work for the new inputs.
- `features/service-form/hooks/useServerErrors.ts` (and test): clears the rows' errors as in "Failures" (a row, a list's own error, all of a list's row errors, the body's two paths), over the same "cleared fields of one response" mechanism; no error is copied.
- `features/service-form/hooks/useCreateService.ts` (and test): `ServiceFormValues` gains `query_params`, `headers` (each `{ name: string; value: string }[]`), `body_type` and `body_content` (text); the request body is built with the function in `lib/requestRows.ts`.
- `features/service-form/hooks/useLeaveGuard.ts` (and test): takes the new values; "changed" as above.
- `features/service-form/components/RequestRowsGroup.tsx` (new, with a test) or the equivalent: the query parameter rows, the header rows, the Body type choice and the Body text, taking from the form what `TimingGroup` and `AlertsGroup` take (`control`, `register`, `saving`, the messages, the clear functions). It holds no request logic. The rows use `useFieldArray` on the form's `query_params` and `headers`.
- `features/service-form/components/AddServiceForm.tsx`: places the rows inside the Request group, changes the URL hint, adds the new default values, passes the errors and the clear functions.
- `features/service-form/components/FormBanners.tsx`: the `413` second line.
- `features/service-form/service-form.css`: only what the board's styles need for the new parts that `components.css` lacks (spacing between the rows and the body field inside the Request group), copying values from `docs/design/service-form.css`.

## Design reference

Reference only, read-only: `docs/design/service-form.html` (the Request group in "Add service: idle (HTTP)", "Edit service: every saved value shown (HTTP)", "Body: JSON selected" and "Field errors: rows and ranges") with `docs/design/service-form.css` and `components.css`; the validation wording table in the same file. Copy values and rules from the styles; never copy board markup or component code. Build with the existing wrappers and Lucide icons. Where the board and the contract disagree the contract wins; the listed differences are in "Decisions" and `docs/design/README.md` (field paths, no numbers in hints, the server's message instead of a fixed sentence).

Texts copied from the board as written: `Query parameters`, `No query parameters.`, `Add parameter`, `Headers`, `No headers.`, `Add header`, `Body type`, `None`, `JSON`, `Plain text`, `Form (URL-encoded)`, `Body`, the URL hint, `Values are shown in full.`, the `413` second line, and the row labels `Query parameter 1 name`, `Header 1 value`.

## Dependencies

None. `react-hook-form`, `lucide-react` and `@base-ui/react` are installed; `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Mock `createService` at the wrapper boundary as `AddServiceForm.test.tsx` does, keeping the real query key; use the `problem`, `validationProblem` and `fieldError` fixtures; use `user-event`.

**`components/NameValueRows.tsx`** (the moved test, plus)

- Every case of the old `HeaderRows` test still passes with the target dialog's words.
- With `itemName="Query parameter"`, `emptyText`, `addLabel` and no hint: the inputs are named `Query parameter 1 name` and `Query parameter 1 value`, the Remove button `Remove query parameter 1`, the empty text and the Add button carry the given words, and no hint is rendered.
- With a `hint`: it shows as text beside the Add button, and the group's `aria-describedby` names it; with a list error as well, it names both.
- A row error and a list error render as text with `aria-invalid` and `aria-describedby` as before; markup in a message shows as text (NFR-7).
- Two instances on one page have no id in common: their list errors and hints each have their own id, and each group's `aria-describedby` names its own.

**`lib/requestRows.ts`, `useCreateService`, `useLeaveGuard`**

- The request body has `query_params` and `headers` as arrays of `{ name, value }` in row order with the texts untrimmed (a name of ` a ` is sent as ` a `), `[]` when there are no rows, an empty row sent as `{ name: '', value: '' }`; `body` is `{ type: 'json', content: '{"a":1}' }` for JSON, `text` for plain text and `form` for form; with `none` there is no `body` key, even when body text was typed (FR-35, FR-37).
- "Changed" is false at the start; true with one query parameter row (even empty), with one header row, with the body type not `None`, with body text while the type is `None`; false again when everything is put back.
- Ids, paths and labels: row `i` maps to `service-query-{i}-name` and `check.query_params[{i}].name`, and so on for the three others; `fieldLabel` gives `Query parameter 3 name`, `Header 1 value`, `Body`, `Body type`, `Query parameters`, `Headers` for their paths, with an input for the row paths and `check.body.content`, and none for `check.query_params`, `check.headers` and `check.body.type`; `check.type` and `toString` still map to themselves with no input.

**`useServerErrors`**

- Clearing a row's path removes only that row's entries; clearing a list's own path removes only its entry; "clear all rows of a list" removes the list's row entries and its own and leaves the other list's and the body's; clearing the body content removes its entry only; another response starts with nothing cleared.

**The form (`AddServiceForm.test.tsx`, `RequestRowsGroup.test.tsx`)**

- Idle: the Request group shows, after the method and URL, `Query parameters` with `No query parameters.` and `Add parameter`, `Headers` with `No headers.`, `Add header` and the hint `Values are shown in full.`, and `Body type` with the four options and `None` chosen, and no Body text; the URL's description reads `Starts with http:// or https://. Query parameters can go here or below.`; the footer status is empty.
- Rows: `Add parameter` adds a row whose Name input has focus, with the inputs named `Query parameter 1 name` and `Query parameter 1 value`; the same for headers (`Header 1 name`); Remove moves focus to the next row's Name, the previous row's when the last row went, and to Add when none is left (NFR-4); there is no limit on the number of rows on the client.
- Body: choosing `JSON`, `Plain text` or `Form (URL-encoded)` shows the Body text with the hint `Sent as entered.`; choosing `None` hides it and the text comes back when the type is chosen again.
- Send: with nothing touched the `check` is `{ type: 'http', method: 'GET', url, query_params: [], headers: [] }`; with two query parameter rows, one header row and JSON body typed, the request has them in order with the text as typed, `body: { type: 'json', content }`; a row with an empty name is sent as it is, with no client error; typed body text with the type back on `None` sends no `body`; a header value is sent in full, never masked (FR-39).
- In flight: the row inputs and the body text are read-only, and the Add, Remove buttons and the Body type choice are disabled; they are editable again after a failure.
- A `422` with `check.query_params[1].name`, `check.headers[0].value` and `check.body.content`: the summary lists `Query parameter 2 name: …`, `Header 1 value: …`, `Body: …` in the order sent, each a link that moves focus to its input, each message shows under its input with `aria-invalid` and `aria-describedby`, and the summary has focus. A message with markup shows as text.
- A `422` with `check.query_params` and `check.headers` (`too_many`): each message shows under its list, the summary lists `Query parameters: …` and `Headers: …` as plain text with no link, and no input is marked invalid.
- A `422` with `check.body.type`: the summary lists `Body type: …` as plain text, with no link and no input marked invalid.
- Clearing: editing a row input removes only its error and entry; `Add parameter` removes the list's own error; Remove on a list removes that list's row errors and its own but leaves the other list's errors; typing in the Body removes `check.body.content`; choosing another Body type removes both body errors; the last removal removes the summary.
- A `422` for `check.url` together with a row error: both are shown and cleared independently.
- `413`: the banner's two lines read `The service is too large to save.` and `Together its fields are over 1 MB. Shorten the body or the header values.`
- Leaving: adding a row, typing in a row, choosing a body type or typing body text makes the footer say `Unsaved changes`, Cancel opens the discard question and the unload prompt is armed; putting everything back empties the status and Cancel leaves at once.
- Tab order: Tab goes from the URL to `Add parameter` (with no rows), `Add header`, the Body type choice (one stop; arrow keys move the choice), then Check interval (with the body `None`); with a JSON body, the Body text comes before Check interval. With one row in each list, the order is query Name, Value, Remove, `Add parameter`, header Name, Value, Remove, `Add header` (NFR-4).
- Replaced on purpose, all in the files named: (1) `AddServiceForm.test.tsx` "shows the heading…" (the URL's description) and every test that asserts the request body with `check: { type, method, url }` ("sends what was typed…", "Try again sends the same values…", "sends messages exactly as typed with alerts off", the PATCH and default-method cases, and the like), `useCreateService.test.tsx`'s `toStrictEqual`, and `App.test.tsx`'s body assertion now expect `query_params: []` and `headers: []`. (2) Tests that use `check.headers[0].value` or `check.headers[2].value` as the example of an unmapped path ("lists an unmapped path as plain text…" and the Alerts-group test that sends `check.headers[0].value`, in `AddServiceForm.test.tsx`; the `maps %s to itself` list in `fieldLabels.test.ts`; the case in `useServerErrors.test.tsx`) now use `check.type`, because the row paths are mapped now. (3) The `413` test's second line. (4) The Tab-order test of the Alerts group (the order from the URL to the switch now includes the rows' Add buttons and the Body type choice). (5) Typed fixtures: `useCreateService.test.tsx`'s `VALUES: ServiceFormValues` and the `Harness` of `useLeaveGuard.test.tsx` get the new values; any test that counts the form's groups or fieldsets must keep passing with the new nested row fieldsets (they are not `legend.group__legend`). (6) `HeaderRows.test.tsx` moves to `NameValueRows.test.tsx`. Nothing else is loosened.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

## Verifier checks

- **By reading `useCreateService.ts`, `lib/requestRows.ts` and `RequestRowsGroup.tsx`:** the body always has both arrays; `body` is absent for `none`; no trimming, no dropping of empty rows, no client-side limit (no row count, no length, no minimum); no server message is rewritten.
- **By reading the components:** `NameValueRows` is in `components/` and imports nothing from `features/`; `features/alert-list` and `features/service-form` both use it and neither keeps a copy of `HeaderRows`; the target dialog's visible words are byte-for-byte as before (the existing `TargetDialog` tests pass untouched); every label is defined once; no literal colour or pixel value where a token exists, other than values copied from the design CSS; icons from Lucide only; Base UI is imported only inside `components/ui/`.
- **Keyboard, by reading:** the order in the form is Name, Method, URL, query rows, header rows, Body type, Body text, the four timing inputs, the alert switch and messages, the footer; each input is a labelled control; each error is linked by `aria-describedby`; the summary keeps `tabindex="-1"`.
- **Layout, by reading the CSS (jsdom cannot prove it):** the rows collapse to the stacked layout at the existing breakpoint (`.kv` rules); the Body text is full width; the moved `.rows__legend` rule is the only CSS removed from `alert-list.css`.
- **Contract:** the body matches `ServiceInput.check` for `http` (`query_params`, `headers`, `body`); no status or code beyond those the screen already handles.
- **Mutation checks to run:** trim a row's text; drop empty rows; send `body` for `none`; send `body` with no content for a typed type; mask or truncate a header value; send the arrays only when non-empty; map `check.headers[1].value` to the wrong input or label (off by one); leave a row's error after editing it; leave the list's error after Add; on Remove keep the other rows' stale errors; drop a row/body value from "changed"; show the Body text for `none`; hardcode `Header` in `NameValueRows`; make `check.body.type` a link. Each must fail at least one named test.
- **Inputs to try:** 0, 1, 20 and 21 rows (21 is the server's refusal, not the client's); an empty name; a name and value with spaces, markup and a quote; a 5 000-character header value; a body of 70 000 characters (the server refuses, the screen shows its message); every body type with and without text; a `422` with errors on both lists, one body error and one URL error at once, then Add and Remove in each list.
- **What the verifier cannot prove:** the look at 360 px and a real server's limit messages; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design board or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a second shared component (the user approved only the header rows, as `NameValueRows`), an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- A name this file takes from a merged task is missing, or `TargetDialog`'s tests cannot pass without a change in their text.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
