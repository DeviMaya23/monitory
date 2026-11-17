# Task: target form dialog

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

On a service's alert list the admin can add a notification target and edit one, in a dialog (a full-screen sheet at 360 px). The target is an email address or a webhook with an optional name and, for a webhook, custom headers. The server's refusals appear on the fields; a full list, a duplicate contact and an `http://` URL each have the state the board draws. This is the second half of the alert list; the screen itself (the list, removal and the dashboard links) is `alert-list-screen`. The "Send test alert" row of the board's dialog is not built here (`test-target`).

Requirements covered:

- FR-14: the admin adds a target to a service's alert list; it appears in the list.
- FR-15: the admin edits a target; the list shows the new values.
- FR-19, in part: a sixth target is refused with the board's "list full" banner in the dialog, and what was typed stays. (The limit comes from the server; the screen does not know it.)
- FR-80: the name is optional (the counter and `maxlength` are the board's).
- FR-81: the admin chooses Email or Webhook.
- FR-82, FR-87, FR-89, FR-110, FR-92 (the limits of headers), in part: the server's `422` message for each is shown on its field. The screen checks only that the address or URL is filled.
- FR-88: a contact already in the list is refused with a message on the address or URL field, on add and on edit.
- FR-92, in part: a webhook target's custom headers are added, edited and removed as rows.
- FR-100: when the URL starts with `http://` the form says that the URL and headers are sent unencrypted; saving is still allowed.
- NFR-4, in part: the dialog works from the keyboard; focus starts in Name, the discard question's focus is on Keep editing and focus returns to where the admin was.
- NFR-7: names, addresses, URLs and header values the admin types are shown as text, including in the toast.
- NFR-8: a `403 csrf_failed` offers a reload, in the dialog.

Out of scope:

- The "Send test alert" row and its states (FR-107, FR-108): `testTarget` is a stub and the backlog gives it its own task. The dialog has no test row.
- The "Last delivery failed" notice (FR-86), delivery and retries: milestone 2's delivery tasks.
- The `Alerts` switch and the two messages of the service form (FR-20, FR-65): their own task.
- Promoting the discard dialog, the error summary, the server-error hook and the failure banners, which `service-form` also has, to shared places. By the user's decision `alert-list` keeps its own copies (backlog). The same holds for the header rows: they are `alert-list`'s own now, and the milestone 3 service-form task that builds the request headers promotes them (backlog).
- Limits shown as text or enforced on the client except the name's 50 (a fixed limit, FR-87): the address length, the URL length, the header count and the header name and value lengths are deployment configuration, so the board's "Up to 20" hint is not shown (`docs/design/README.md`) and the server's messages carry the numbers.
- Edit and Add target for a list the server cannot read, and any change to the server.
- End-to-end tests. The milestone's last task writes them.

## Prerequisite

All merged on the default branch (the builder checks first and stops to ask if one is missing; it creates none of them):

- `alert-list-screen`: `frontend/src/lib/api/targets.ts` (`Target`, `TargetList`, `targetsQueryKey`, `listTargets`, `deleteTarget`), `features/alert-list/` (`AlertList.tsx`, `TargetRow.tsx`, `AlertListBanners.tsx`, `hooks/useTargetList.ts`, `hooks/useRemoveTarget.ts`, `alert-list.css`), `pages/AlertListPage.tsx`, and the target fixtures in `test/fixtures.ts`. The names are those that task's file fixes; if one differs on `main`, use the real name and say so in the plan.
- `targets-api`: `createTarget` and `updateTarget` are real on the server.
- **The `Target` contract fix** (the user makes it, with `make generate`, before `alert-list-screen`): the generated `Target` in `frontend/src/lib/api/schema.d.ts` is `{ type: "Target" } & Omit<TargetInput, "type">`, which loses `address`, `url`, `headers` and the real `type`. After the fix `Target` is an email shape or a webhook shape, each with `id` and `last_delivery_failed`, and `target.type` is `'email'` or `'webhook'`. The builder checks that `Target` has `address` for `type: 'email'` and `url` and `headers` for `type: 'webhook'`; if not, it stops and says so.
- `portal-into-app` (a short frontend task, drafted next to this one): `Dialog`, `AlertDialog` and `Select` portal into a host element that carries `.app` (not `#root`), so the `@container app` rules, `.app :focus-visible` and the font reach them. The builder checks that `Dialog.tsx` passes `getPortalHost()` (from `components/ui/portalHost.ts`) as the container of its portal; if not, it stops and says so.

## Role and ownership

Role: Frontend.

You may change `frontend/src/**`. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `backend/**`, `docs/**` (except your own plan file, `docs/tasks/target-form-dialog.plan.md`), or anything else outside `frontend/src/`. Do not change `features/service-form/**` or `features/service-list/**`.

Shared files this task touches, all owned by this task while it runs:

- `frontend/src/components/ui/Dialog.tsx` and `Dialog.test.tsx`: three optional props are added (below); every existing use behaves as before. Not the portal: `portal-into-app` did that.
- `frontend/src/components/ui/RadioGroup.tsx` (new) and its test: a new shared wrapper, approved with this task by the user.
- `frontend/src/styles/components.css`: only the rules the board's dialog needs and the project lacks (see Design reference).
- `frontend/src/lib/api/targets.ts`: adds `createTarget` and `updateTarget`.
- `frontend/src/features/alert-list/**` and `pages/AlertListPage.tsx`: as `alert-list-screen` left them.
- `frontend/src/test/fixtures.ts`: only if a helper is missing.

Tasks that may run at the same time: `alert-dispatch` (backend only). No other frontend task runs beside this one.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `createTarget` | `POST /api/services/{serviceId}/targets` | 201 (`Target`); 422 `validation_failed` with `errors`; 409 `alert_list_full`; 409 `target_duplicate`; 403 `csrf_failed`; 404 `not_found`; 401 `unauthenticated` (the shell ends the session); 413, 415, 400, 500 and any other failure, including a network error, as "something went wrong". Real on the server |
| `updateTarget` | `PUT /api/services/{serviceId}/targets/{targetId}` | 200 (`Target`); 422 `validation_failed`; 409 `target_duplicate`; 403 `csrf_failed`; 404 `not_found`; 401; 413, 415, 400, 500 and any other failure as "something went wrong". Real on the server. The contract lists no `alert_list_full` for it |
| `listTargets` | `GET /api/services/{serviceId}/targets` | As `alert-list-screen`; this task refetches it after a 404 |

The body of both is `TargetInput`: `{ type: 'email', name?, address }` or `{ type: 'webhook', name?, url, headers? }`; `name` up to 50, `address` up to 254, `url` up to 2,048, up to 20 headers with a name of 1 to 128 characters and a value up to 4,096. The screen does not enforce any of these but the name's 50. `X-CSRF-Token` is added by `apiRequest` for `POST` and `PUT`. A field error is `{ field, message, code }`; for a target the paths the server sends are `type`, `name`, `address`, `url`, `headers` (too many rows) and `headers[i].name` and `headers[i].value` (zero-based `i`).

## Behavior

### What exists

After `alert-list-screen`: the list, each row with a `Remove` button and the inline confirmation, `useRemoveTarget`, the cached list under `targetsQueryKey(serviceId)`, and `Dialog` (a plain modal with no Close button), `Toast`/`useToast`. `service-form` has the discard dialog, error summary, server-error hook and banners that the board's service form uses; this task does not import them (features do not import each other) and writes its own, in the same shape.

### Opening it

- **Add target** (`btn btn--primary`, Lucide `Plus`, text `Add target`) is in the list's footer `div.list-foot` after the rows, next to the hint `Email or webhook. Alerts go to every target when the service goes down or recovers.`, and in the empty state under its text. It is always enabled: the limit is not readable, so a full list is found out on save. It shows with the list and with the empty state, and not while loading, when the list could not be loaded with no data, or when the service is not found. `AlertListPage` passes the `serviceId` down to the screen and the dialog.
- **Edit** (`btn btn--ghost`, Lucide `Pencil`, visible text `Edit`, `aria-label="Edit {label}"` with the same `{label}` rule as Remove) is a second button in each row's actions, before `Remove`. It opens the dialog for that target, filled with a snapshot of it. A refresh of the list while the dialog is open does not change the dialog and does not close it.
- The dialog is modal, 600 px wide (`dialog--wide`); at 360 px a full-screen sheet. Title `Add target` or `Edit target`. A `Close` icon button (`btn btn--ghost btn--icon`, Lucide `X`, `aria-label="Close"`) sits at the end of the head. Focus starts in the Name input.
- `Add target` and every `Edit` are `disabled` while a removal request is in flight, as `alert-list-screen` disables the other rows' `Remove` (the confirming `Remove` keeps `aria-disabled`, as that file says), so the dialog and a removal never run at once. Opening the dialog (Add target or Edit) first closes any removal question that is open, with nothing sent.

### The form

Fields in this order, inside `div.dialog__body`:

| Field | Control and text | Notes |
|---|---|---|
| Name | `label` `Name` with the muted `(optional)`, `input.input` `type="text"`, placeholder `e.g. On-call inbox`, `maxLength` 50; to the right of the label the counter `{n}/50` | the counter counts the typed characters; the fixed 50 is a named constant in the feature |
| Type | `Type` with the `RadioGroup` wrapper: `Email` (Lucide `Mail`) and `Webhook` (Lucide `Webhook`), styled by the existing `.segmented` rules | on add, `Email` is chosen; on edit, the target's type. The admin may change the type on edit; the values typed for the other type are kept in the form but not sent |
| Email address (type Email) | `label` `Email address`, `input.input` `type="email"` | |
| Webhook URL (type Webhook) | `label` `Webhook URL`, `input.input.input--mono` `type="url"`, placeholder `https://`, hint `Starts with http:// or https://.` | the hint is replaced by the field's error when there is one |
| Warning (type Webhook) | `p.notice.notice--warn` with Lucide `TriangleAlert`: `This URL uses http://, so the URL and headers are sent unencrypted. You can still save it.` | shown whenever the typed URL, after leading spaces and ignoring case, starts with `http://`; not for `https://` or while the text is shorter; it does not stop saving (FR-100) |
| Custom headers (type Webhook) | `fieldset` with `legend` `Custom headers` and the muted `(optional)`; `.rows` with a head (`Name`, `Value`), one `.kv` row per header, `Add header` (`btn`, Lucide `Plus`) | below |

**Header rows.** `Add header` appends an empty row and puts focus in its name input. Each row has a name input and a value input (`input.input.input--mono`), each with a visible label `Name` and `Value` that is shown only in the 360 px layout (`kv__label`), and an accessible name `Header {n} name` and `Header {n} value` (`n` from 1; they renumber when a row goes), and a `Remove header {n}` icon button (`btn btn--ghost btn--icon`, Lucide `Trash2`, `aria-label`). Removing a row moves focus to the next row's name input, or to the previous row's, or to `Add header` when none is left. With no rows the block shows the muted text `No custom headers.` (`rows__empty`, as the board draws it). There is no client limit on the number of rows. Rows are sent as typed, including empty ones; the server names an empty name.

**What is sent.** Email: `{ type: 'email', name, address }`. Webhook: `{ type: 'webhook', name, url, headers }` with `headers` the rows in order (`[]` when none). `name` is always sent as typed, an empty string included, so that an edit can clear it. The fields of the other type are never sent.

**Client checks.** Only that the active contact is filled (not blank after trimming): email `Enter an email address.`; webhook `Enter a URL that starts with http:// or https://.` These show on the field on submit, move focus to it, send nothing, and go when that field is edited. Everything else, including the format, is the server's.

**Footer.** `Cancel` (default button) and the primary button: `Add target` on add, `Save target` on edit. The footer is outside the form element, so the primary button is tied to the form by `form=`; Enter in an input submits.

### Saving

While the request is in flight: the primary button is `disabled`, `aria-busy="true"`, shows a spinning `LoaderCircle` (class `spinner`) and reads `Saving…`; `Cancel`, Close, Esc and a click on the backdrop do nothing; the inputs are read-only; a second submit sends nothing.

Outcomes, in the order the checks are made: a `401 unauthenticated` first (the shell ends the session; nothing here), then by status and code, never by message text.

| Result | Dialog | List | Toast | Where it shows | Focus |
|---|---|---|---|---|---|
| 201 | closes | the returned target is added at the end of the cached list (below) | success, `Target added.` | | the opener (the footer's `Add target`, or the empty state's) if it is still in the page, otherwise the new row's `Edit` button (set through `Dialog`'s `finalFocus`) |
| 200 | closes | the returned target replaces the one with its id | success, `Target saved.` | | that row's `Edit` button |
| 422 `validation_failed` with errors | stays | unchanged | none | the summary (below) and each field | the summary |
| 409 `target_duplicate` | stays | unchanged | none | on the address or URL field: `This address is already in this service’s alert list.` (email) or `This URL is already in this service’s alert list.` (webhook); a banner is not shown | that field |
| 409 `alert_list_full` (add only) | stays | unchanged | none | a banner in the dialog: title `This alert list is full.`, text `Remove a target before adding another.`; typed values stay | the primary button |
| 404 `not_found` on add | closes | the list is fetched again (so that a deleted service shows "service not found") | none | | the opener; if the fetch then replaces the page with "service not found", that block's `h2` takes focus (`alert-list-screen`'s rule) |
| 404 `not_found` on edit | stays | unchanged | none | a banner in the dialog: title `This target no longer exists.`, text `It was removed, perhaps in another tab.`, and a button `Close and refresh` that closes the dialog and fetches the list again | the banner's button; after `Close and refresh`, the row's `Edit` button if the row is still there after the fetch, otherwise the page title or the "service not found" `h2` |
| 403 `csrf_failed` | stays | unchanged | none | a banner: title `The request wasn’t accepted.`, text `Reload the page and try again.`, button `Reload` (Lucide `RefreshCw`) calling `window.location.reload()` | the primary button |
| anything else: 500, 413, 415, 400, a network error, a 403, 404 or 409 with another code or no problem body, a 422 with no errors or another code, `alert_list_full` on an edit | stays | unchanged | none | a banner: title `Something went wrong.`, text `The server couldn’t be reached or returned an error. Your values are still here.`, button `Try again` (Lucide `RefreshCw`) that submits again | the primary button |

Every submit starts by clearing the last failure (banner and summary); a new failure replaces it; a banner has no close button and otherwise stays until the dialog closes. The banners and the summary sit together in the dialog's live region (`aria-live="polite"`) at the top of the body, the summary first. A 404 on an edit whose banner is shown leaves `Save target` enabled (a second try shows the same banner again).

**The `422` summary.** `div.banner.banner--error` (`role="alert"`, `tabindex="-1"`, Lucide `CircleAlert`) with the title `1 field needs fixing before this can be saved.` or `{n} fields need fixing before this can be saved.` and a list: one entry per error, in the server's order, as `{label}: {message}`; an entry whose path has an input is a link that moves focus to that input. Labels: `name` `Name`; `address` `Email address`; `url` `Webhook URL`; `headers[i].name` `Header {i+1} name`; `headers[i].value` `Header {i+1} value`. A path with no input (`type`, or any other) shows as its path with the message, with no link; the bare path `headers` (the server's "Too many rows" error, code `too_many`) has the label `Custom headers`, no link, and its message also shows as `p.error-text` under the header rows. The summary is built by the user's decision although the board does not draw it (the user adds it to `docs/design/README.md`, "Additions that are built"). Each field also shows the server's `message` as it is under its input (`p.error-text` with Lucide `CircleAlert`, `aria-invalid` and `aria-describedby` on the input); with two errors for one field the first. A field's error and its summary entries go when that field is edited; removing a header row drops every header error, `headers` and `headers[…]` alike (the indexes move); `Add header` drops only the bare `headers` error (the count changed).

**Taking the result into the cache.** On a 201 or 200: (1) an in-flight request for this list is cancelled first, so that an older reload cannot overwrite the new target; (2) the cached array gets the target appended (201) or replaced in place by `id` (200), the others keep their objects and positions; if the cache holds no list, nothing is written; (3) the time of the last real load is kept (`setQueryData` with `updatedAt` set to the entry's `dataUpdatedAt`). The cache change and the toast belong to the mutation's options, so they happen even if the page is no longer mounted when the answer arrives.

### Leaving without saving

The discard question is rendered inside the dialog's content, so that the library treats it as nested: Esc, the backdrop and `Keep editing` on it close only the question, never the form.

The form is **changed** when any value (name, type, address, URL, any header row, the inactive type's too) differs from what the dialog opened with (empty with `Email` on add; the target's values on edit). `Cancel`, Close, Esc and a click on the backdrop:

- when not changed (and not saving): close the dialog; focus returns to the opener (the footer's `Add target`, or the row's `Edit`; if the opener is gone, the page title).
- when changed (and not saving): open the discard question over the dialog: a `Dialog` with the title `Discard unsaved changes?`, the text `The changes to this target will be lost.`, and the buttons `Keep editing` (focus starts here; also Esc and the backdrop) and `Discard changes` (`btn btn--danger`), which closes both. Nothing is sent.

While the form is changed and not saving, closing or reloading the browser tab asks with the browser's own prompt (`beforeunload`); when the dialog closes or the form is not changed, the listener is gone.

### Changes to the screen that `alert-list-screen` built

- **Focus after a removal** now follows the board: the next row's `Edit` button; when the removed row was the last, the footer's `Add target`; when the list becomes empty, the empty state's `Add target`. The move runs once the removal has settled (the in-flight flag is false), because `Add target` and `Edit` are `disabled` until then. (`alert-list-screen` sent focus to the next row's `Remove` or to the title.)
- **The empty state** gains the `Add target` button under its text.

### Known gaps

- **No client limit** on the address, the URL, the header count or the header lengths; the server's message is the only place a limit shows. The board's "Up to 20" hint is not shown.
- **The test alert row is missing** from the dialog until `test-target`.
- **A `type` error cannot be linked** (the radio group has no input to link to) and cannot be produced by the screen, which always sends a type.
- **A 404 on edit** leaves `Save target` enabled, and its banner says the target is gone even when the server answered 404 because the service is gone (the board's state is "Target or service not found"); `Close and refresh` then ends on the "service not found" page.
- **Header rows exist twice after milestone 3** unless the promotion happens (backlog); so do the discard dialog, summary and banners (backlog).
- **A webhook URL typed as `HTTP://`** gets the warning (the check ignores case); the contract says "starts with http" and the server's rule decides what is accepted.
- **Two header rows with the same name**, and names or values with CR or LF, are sent as typed; the server's rules decide (the backlog's `targets-api` loose end).
- **The sheet at 360 px** is full-screen with no peek of the page behind it, as the board draws.

## Structure

By `ARCHITECTURE.md`: the dialog belongs to the `alert-list` feature. Names marked "new" do not exist yet and are fixed by this file; other names are the builder's choice. One hook per concern, each with a colocated test written in the same step (`CONVENTIONS.md`).

- `frontend/src/lib/api/targets.ts` and `targets.test.ts`: add `createTarget(serviceId, input)` (`POST`) and `updateTarget(serviceId, targetId, input)` (`PUT`), thin wrappers over `apiRequest` with the ids passed through `encodeURIComponent`, and the type `TargetInput` from the generated schema.
- `frontend/src/components/ui/RadioGroup.tsx` (new) and `RadioGroup.test.tsx` (new): a wrapper over `@base-ui/react/radio-group` and `radio`; only this file imports them. Props: a label (the group's accessible name, shown by the caller), `value`, `onValueChange`, `options` (value, text, optional icon), `disabled`, and an id. It renders each option as a `label` (inside `div.segmented`, inside the `radiogroup`) that holds the Base UI radio, the icon and the text, so that the existing `.segmented label` layout rules (size, padding, border) still apply; the group's label element has the class `label`. It renders the board's `.segmented` look (see the `components.css` bullet). Arrow keys move the choice, Tab enters and leaves the group once.
- `frontend/src/components/ui/Dialog.tsx` (and test): three optional props. `showClose`: renders the Close icon button in the head, calling `onClose` (not while `busy`). `sheet`: adds the board's `dialog-layer--sheet` and `dialog--sheet` classes. `finalFocus`: passed to the popup as `AlertDialog`'s is, to decide where focus goes on close (a function returning an element or null; absent, or null, means the opener, as today). Without them the wrapper is unchanged; the existing tests stay as they are.
- `frontend/src/features/alert-list/hooks/useTargetDialog.ts` (new) with a test: which dialog is open (`none`, add, or edit with the snapshot), `openAdd`, `openEdit(target)`, `close`; and the opener to return focus to.
- `frontend/src/features/alert-list/hooks/useSaveTarget.ts` (new) with a test: the request (`createTarget` or `updateTarget`), the cache change, the toasts, and the failure as a value (`field-errors`, `duplicate`, `full`, `not-found`, `csrf`, `unexpected`; a new object for every failure). Never copies server data into component state.
- `frontend/src/features/alert-list/hooks/useTargetServerErrors.ts` (new) with a test: the field errors of the last `422` minus the fields edited since, `errorFor(field)`, `clearField`, `clearHeaders` (the feature's own copy of the shape `service-form` has).
- `frontend/src/features/alert-list/hooks/useTargetLeaveGuard.ts` (new) with a test: whether the form is changed, the discard question, the `beforeunload` listener.
- `frontend/src/features/alert-list/components/TargetDialog.tsx` (new) with a test: the dialog, the form (react-hook-form with `useFieldArray` for the headers) and its footer, over `Dialog`.
- `frontend/src/features/alert-list/components/HeaderRows.tsx` (new) with a test: the header rows, taking the form's field array; no knowledge of targets in its text, so that it can be promoted.
- `frontend/src/features/alert-list/components/TargetDialogBanners.tsx` (new): the live region's banners and the summary. `TargetDiscardDialog.tsx` (new): the discard question.
- `frontend/src/features/alert-list/lib/targetFields.ts` (new) with a test: server path to label and input id (`headers[i].name` to `Header {i+1} name`), the field ids, and the constant for the name's 50.
- `frontend/src/features/alert-list/components/AlertList.tsx` and `TargetRow.tsx`: the Add target buttons, the Edit button, the dialog, the closing of an open removal question and the new focus rules (`AlertList` owns the focus move after a removal, as `alert-list-screen` says).
- `frontend/src/features/alert-list/alert-list.css`: copy from `docs/design/alerts.css` (values and rules only) `.list-foot` and its 640 px rule. Leave out `.test-row`.
- `frontend/src/styles/components.css`: it already has `.dialog-layer--sheet`, `.dialog--sheet`, `.opt`, `.rows*`, `.kv*`, `.notice--warn`, `.hint`, `.counter`, `.stack` and `.segmented`. Its `.segmented` rules are written for native radios (`label:has(input:checked)`, `:focus-visible`, and layout on `.segmented label` and `.segmented input`); the Base UI radio focuses its own element, so add the matching state rules for the library's parts (its checked and focus-visible state, and hiding of its native input if it needs it) next to them, with the same look, and change none of the existing ones. `.opt` only styles inside `.label`: the labels `Name` and `Email address`, and the `legend` of `Custom headers`, carry the class `label`, as the board's do.
- `frontend/src/features/alert-list/alert-list.css` also gets copies of `.form-banners` and `.form-summary` from `service-form.css` (feature-owned there), under the same names.
- **Mocks of `lib/api/targets`** that keep the real `targetsQueryKey`: the pass-through form, adding `createTarget: vi.fn()` and `updateTarget: vi.fn()`.

## Design reference

Reference only, read-only: `docs/design/alerts.html` (states List, Empty, Add target: email, Add target: webhook over http:// with headers, Saving, Field errors, Duplicate contact, List full, Target or service not found, and the failure banners) and `docs/design/alerts.css`, `components.css` for the dialog, the sheet, `.segmented`, `.kv`, `.rows`, `.notice`; `docs/design/README.md` (the field-path rule: `headers[0].name`; "Up to 20" and the length hints are not shown; the name counter stays; the discard dialog is an addition that is built). Copy values and rules from the styles into the project's CSS; never copy board markup or component code. Use `components/ui/` wrappers and the new `RadioGroup`; icons from Lucide only. Where the board and the contract disagree the contract wins.

Texts copied from the board as written: `Add target`, `Edit target`, `Save target`, `Saving…`, `Name`, `(optional)`, `Type`, `Email`, `Webhook`, `Email address`, `Webhook URL`, `Starts with http:// or https://.`, the `http://` warning, `Custom headers`, `Add header`, the header accessible names, `This alert list is full.` with `Remove a target before adding another.`, `This address is already in this service’s alert list.`, `This target no longer exists.` with `It was removed, perhaps in another tab.` and `Close and refresh`, `The request wasn’t accepted.`, `Something went wrong.`, `Close`, the hint beside Add target and `Remove header {n}`.

Texts decided here (not drawn, or drawn differently): `Target added.`, `Target saved.`, `This URL is already in this service’s alert list.`, `Reload the page and try again.` (as the service form), the summary titles `1 field needs fixing before this can be saved.` and `{n} fields need fixing before this can be saved.` (as the service form; the summary is not on the board), `Your values are still here.` on the generic banner (as the service form), `e.g. On-call inbox`, the client messages `Enter an email address.` and `Enter a URL that starts with http:// or https://.` (the server's wording for the same cases), `Try again` and `Reload` as banner buttons, the discard text `The changes to this target will be lost.`, the focus rules after saving and after a removal, that the type may be changed on edit, that rows are sent as typed, and that closing is blocked while saving.

## Dependencies

None. `@base-ui/react` 1.9.0 (with its radio group), `react-hook-form`, `@tanstack/react-query` 5.107.1 and `lucide-react` 1.73.0 are installed; `package.json` and the lockfile do not change. `Pencil`, `Plus`, `X`, `Mail`, `Webhook`, `Trash2`, `TriangleAlert`, `CircleAlert`, `LoaderCircle` and `RefreshCw` exist in Lucide 1.73.0 (if one is missing, use the closest and say so in the plan).

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Mock `createTarget`, `updateTarget`, `listTargets`, `deleteTarget` and `listServices` at the wrapper boundary with value-return spies, typed through the fixtures. A request that answers late is a promise the test resolves. A rejection that stands for a problem response uses the `problem(status, code)` and `validationProblem(...)` fixtures. Time-driven tests use fake timers with `fireEvent`; other tests use `user-event`.

**`lib/api/targets.ts`**

- `createTarget('s1', input)` calls `apiRequest('POST', '/api/services/s1/targets', input)` once; `updateTarget('s1', 't1', input)` calls `apiRequest('PUT', '/api/services/s1/targets/t1', input)`; ids with a space and a slash are encoded; a rejection reaches the caller unchanged (NFR-8).

**`RadioGroup`**

- It is a `radiogroup` named by its label; the chosen option is checked; a click and an arrow key change the value and call `onValueChange` once; Tab enters and leaves once; `disabled` blocks both; each option's text and icon are shown.

**`Dialog` (added props)**

- `showClose` renders a button named `Close` that calls `onClose` once, and does nothing while `busy`; without the prop there is no such button (the existing tests pass unchanged); `sheet` adds the two classes and its absence leaves them out.

**Hooks (each with a real query client where the cache is involved)**

- `useTargetDialog`: `openAdd` and `openEdit(target)` set the mode and the snapshot; a later change to the target object does not change the snapshot; `close` clears it.
- `useSaveTarget`:
  - 201: `createTarget` called once with the service id and the input; the cached list gets the returned target last, the others keep their objects and order, `dataUpdatedAt` is unchanged, `listTargets` is not called, the toast `Target added.` shows (FR-14). 200: `updateTarget` called with both ids; the target is replaced in place and `Target saved.` shows (FR-15). With no cached list nothing is created. A list request in flight when the answer arrives is cancelled: an older reload resolving later does not remove the new target. Unmounting during the request still writes the cache and shows the toast.
  - 422 gives `field-errors` with the server's errors in order; 409 `target_duplicate` gives `duplicate`; 409 `alert_list_full` gives `full`; 404 gives `not-found`; 403 `csrf_failed` gives `csrf`; a 500, a network `TypeError`, a 413, a 403 with another code and a 404 with no problem body (`new ApiError(404, null, null)`) give `unexpected`; 401 gives no failure. No toast and no cache change for any failure. A second submit while in flight sends nothing. Each failure is a new object even when the kind repeats.
- `useTargetServerErrors`: `errorFor` returns the first message of a path; `clearField` removes that field's error and its summary entries (`clearField('headers')` removes the bare `headers` error and leaves `headers[…]` ones); `clearHeaders` removes the bare `headers` entry and every `headers[…]` entry; a new response starts with nothing cleared.
- `useTargetLeaveGuard`: not changed at the start; changed when any value differs (including the inactive type's field and a header row); back to unchanged when the values return to the initial ones; the `beforeunload` listener is added only while changed and not saving, and removed otherwise (a small harness component with `render()`).

**`targetFields`**

- `headers[0].name` is `Header 1 name`, `headers[2].value` is `Header 3 value`, `name` is `Name`, `address` is `Email address`, `url` is `Webhook URL`, `type` and an unknown path have no input; the name limit constant is 50.

**`HeaderRows` and the form (`TargetDialog.test.tsx`, rendering the page's `AlertList` with the dialog)**

- Add: `Add target` opens the dialog titled `Add target` with `Email` chosen, the Name input focused, the counter `0/50`, the label `Email address`, no header rows, a footer with `Cancel` and `Add target`; typing 12 characters shows `12/50` and the input has `maxlength` 50; the `Close` button is present; no `Send test alert` control exists (FR-14, FR-80, FR-81).
- Choosing `Webhook` shows `Webhook URL`, the hint, the `Custom headers` fieldset and `Add header`, and hides the email field; switching back keeps what was typed in each; a submit sends only the active type's fields: `{ type: 'email', name, address }` or `{ type: 'webhook', name, url, headers }` (`headers: []` with no rows), and `name` is sent as typed, `''` included.
- The `http://` warning shows for `http://x`, for `  HTTP://x` and not for `https://x`, for `http:/` or for an empty URL, and a save is still sent (FR-100).
- Header rows: `Add header` appends a row and focuses its name input; each row has `Header {n} name`, `Header {n} value` and `Remove header {n}`; removing row 2 of 3 renumbers the rest and focuses the next row's name input; removing the only row focuses `Add header`; rows are sent in order, as typed, an empty row included; there is no limit on the count (FR-92).
- Client checks: an empty or blank address shows `Enter an email address.` and an empty URL shows `Enter a URL that starts with http:// or https://.`; nothing is sent, focus is on the field, and editing the field clears the message.
- A name, address, URL and header value of `<b>x</b>` appear as text in the dialog, in the list row and in the `Edit` and `Remove` button names, and no `b` element is created (NFR-7).
- Enter in the Name input submits the form once; Enter while saving sends nothing (NFR-4).
- With no header rows `No custom headers.` shows; it goes when a row is added.
- Each row has `Edit {name}` or, with no name, `Edit {address}`; the footer shows the hint beside `Add target`; with the list not loaded, loading, or the service not found, there is no `Add target`.
- Opening `Edit` or `Add target` while a row's `Remove this target?` question is open closes the question and sends nothing.
- Saving: while pending the primary button is disabled, `aria-busy`, reads `Saving…` with a spinner; `Cancel`, `Close`, Esc and the backdrop do nothing; the inputs are read-only; a second submit sends nothing.
- 201: the dialog closes, the new row is last, the sub line shows the new count, the toast `Target added.` shows, and focus is on the footer's `Add target` when it was the opener; when the opener was the empty state's `Add target` (gone now), focus is on the new row's `Edit` button. Edit: a row's `Edit` opens `Edit target` with the target's values, type and headers, footer `Save target`; a 200 closes it, the row shows the new values in place, the toast `Target saved.` shows, and focus is on that row's `Edit` button; editing a name to empty sends `name: ''` and the row shows `Unnamed …` (FR-15, FR-80).
- A refresh that brings other values for the edited target while its dialog is open leaves the dialog's values alone.
- 422: the summary shows with the right count and each `{label}: {message}`, focus is on the summary, each field shows its message (including `Header 1 name` for `headers[0].name`), an entry's link moves focus to its input, a path with no input is plain text; editing a field clears its message and entry; removing a header row clears all header errors; two errors for one field show the first (FR-82, FR-87, FR-89, FR-110, FR-92).
- 409 `target_duplicate`: the message under the address field (email) or the URL field (webhook) with the texts above, focus on that field, no banner, on add and on edit; editing the field clears it (FR-88).
- 409 `alert_list_full`: the banner `This alert list is full.` with its text, focus on the primary button, typed values stay, the dialog stays (FR-19).
- 404 on add: the dialog closes and `listTargets` is called again; when it then answers 404 the page shows "service not found" and its `h2` has focus. 404 on edit: the banner `This target no longer exists.` with `Close and refresh`; `Save target` is still enabled; the button closes the dialog, calls `listTargets` again, and focus is on the row's `Edit` button when the row remains.
- The next submit clears the previous banner and summary; a second failure replaces the first. A 409 with another code and a 422 with no errors show `Something went wrong.`; `alert_list_full` on an edit does too.
- A 422 with the path `headers` shows `Custom headers: {message}` in the summary and the message under the rows; `Add header` clears it; removing a row clears it with every other header error.
- Esc on the open discard question closes only the question; the form and its values remain.
- 403 `csrf_failed`: the banner with `Reload`, which calls `window.location.reload` once; a 500 and a network error: the banner `Something went wrong.` with `Try again`, the values still in the inputs, and `Try again` sends the request again (NFR-8).
- 401 `unauthenticated`: the shell's sign-in form, no toast, no banner.
- Leaving: an unchanged add dialog closes at once on `Cancel`, `Close`, Esc and the backdrop and focus returns to `Add target`; a changed one opens the discard question with focus on `Keep editing`; `Keep editing`, Esc and the backdrop return to the form with the values; `Discard changes` closes both and sends nothing; an edit dialog opened from `Edit` returns focus to that row's `Edit` button; an edit with the values put back to the originals is unchanged again.
- Removal follows the board: removing a middle row focuses the next row's `Edit` button; removing the last of several focuses `Add target`; removing the only target shows the empty state and focuses its `Add target`. `Add target` and every `Edit` are disabled while a removal request is in flight (the confirming `Remove` is `aria-disabled` and the other rows' `Remove` are `disabled`, as before); opening the dialog closes an open removal question.

Tests this task changes on purpose:

- `AlertList.test.tsx` (from `alert-list-screen`): its criteria "there is no Add target, no Edit button and no Edit link", the empty state's "no button", and the focus after a removal (next row's `Remove`, or the title) are replaced by the behavior above. Nothing else in them is loosened.
- `AlertList.test.tsx`: its criterion for the focus after a removal answered 404 ("as for 204") follows the new rule too.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged; `Dialog.test.tsx`'s existing cases pass unchanged.

## Verifier checks

- **By reading `useSaveTarget.ts`:** the cache change is `setQueryData` on `targetsQueryKey(serviceId)` with `updatedAt` kept, after `cancelQueries`; no refetch on success; the toasts and the cache change are in the mutation's options, not in a callback passed to `mutate`; failures are chosen by `ApiError.status` and `code`, never by message text; a 401 shows nothing; no server data is copied into component state.
- **By reading the form:** react-hook-form with `useFieldArray`; the only client check is "the active contact is filled"; the body has no field of the inactive type; `name` is sent as typed; no limit other than the 50 is enforced (`maxLength` on the input and the counter use the named constant); no `dangerouslySetInnerHTML`; names, URLs and header values are React text children.
- **By reading the components:** only `components/ui/RadioGroup.tsx` imports Base UI's radio group; `Dialog.tsx` has only the three new optional props (`showClose`, `sheet`, `finalFocus`) and still portals as `portal-into-app` left it; no import from `features/service-form` or `features/service-list` anywhere in `features/alert-list`; `HeaderRows.tsx` has no target-specific text; icons from Lucide only; no literal colour or pixel value in a rule where a token exists, other than values copied from the design CSS.
- **Wording, by reading:** every string specific to this dialog (the tables and lists above) is defined once and used from there, with the curly apostrophes and the `…` as written; shared words may repeat.
- **Keyboard, by reading:** Name has focus on open; the order in the form is Name, Type, contact, headers, footer; `Add header` and `Remove header` are buttons in the Tab order; the discard question's initial focus is `Keep editing`; the summary has `tabindex="-1"`; each field's error is linked by `aria-describedby`; the `RadioGroup` follows the library's arrow-key behavior.
- **Layout, by reading the CSS (jsdom cannot prove it):** the sheet rules apply at the board's 640 px breakpoint; `.kv__label` is visible only there; long names and URLs wrap.
- **Contract:** the body matches `EmailTargetInput` or `WebhookTargetInput`; the statuses handled are those the contract lists for both operations plus "anything else"; `alert_list_full` is handled only for the create.
- **Inputs to try:** a name of 50 and of 51 characters pasted; an address with spaces; a URL with 2,049 characters; 21 header rows; an empty header row; a header value with CR or LF; the same contact on add and on edit; the same webhook URL as an email contact (not a duplicate); a list that fills up in another tab; a target deleted in another tab while its dialog is open; a 422 followed by removing a header row; Esc while saving; switching type after a 422; the session ending during a save.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design boards or this file conflict with each other.
- You think you need a change outside your paths, a dependency, an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- `alert-list-screen` is not merged (`features/alert-list/components/AlertList.tsx` is missing), or a name this file takes from it is missing.
- Base UI's radio group cannot give what `RadioGroup` describes, or the `.segmented` look cannot be reached without changing an existing rule's meaning.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
