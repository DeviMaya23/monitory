# Task: target test row

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

In the dialog that adds or edits a notification target, the admin can press "Send test alert" and see whether one alert reaches that target, before saving anything. The row sits at the end of the dialog's body, as the board draws it. It sends the values as typed through `testTarget`, shows "Sending one test alert…", then "Delivered." or "Failed: {reason}", and saves nothing: the alert list, the cache and the toasts are untouched. This is the screen half of FR-107 and FR-108; the server side (`testTarget`) is merged. It also closes the Milestone 2 gap where this row had no task.

Requirements covered:

- FR-107: while adding or editing a target, the admin can send a test alert with the settings currently in the form, before saving; the result says delivered or failed and, when failed, the reason (the server's `failure_reason`, shown as plain text).
- FR-108: a test changes nothing the screen holds: no cached list entry, no toast, no change to the form's values or its "changed" state; when the settings are invalid the test does not send, and the errors name the field (the client check for a blank contact, and the server's `422` for the rest, on the fields as for a save).
- FR-82, FR-89, FR-110, in part: the server's `422` messages for the target settings are shown on their fields and in the summary, as for a save.
- NFR-7: the reason, and every value in an error, is shown as text.
- NFR-8: a `403 csrf_failed` offers a reload, in the dialog.
- NFR-4, in part: the button is reachable by Tab after the last field, works with Enter and Space, and focus is never lost when the test ends.

Out of scope:

- **The server** (`testTarget`, merged), the content of the test alert, any contract change.
- **Retries, the delivery outcome and the "last delivery failed" notice** (FR-85, FR-86): a test is one attempt and never reports an outcome.
- **A duplicate check or the alert-list limit for a test:** the server does not apply them to a test.
- **The service form's test panel** (`testServiceCheck`, FR-104 to FR-106): a different feature.
- **Promoting any dialog piece to a shared place** (backlog; `alert-list` keeps its own copies).
- **End-to-end tests:** the milestone's last task writes them.

## Prerequisite

`target-form-dialog` and `test-target` are merged (they are). The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `features/alert-list/components/TargetDialog.tsx`, `TargetDialogBanners.tsx` (`TargetErrorSummary`, `TargetDialogBanners`), `FieldErrorText.tsx`, `HeaderRows.tsx`; `hooks/useSaveTarget.ts` (the `SaveFailure` kinds, `toFailure` by status and code), `useTargetServerErrors.ts`, `useTargetLeaveGuard.ts`; `lib/targetForm.ts` (`TargetFormValues`, `toInput`, `sameValues`), `lib/targetFields.ts`; `alert-list.css`; and their tests.
- `frontend/src/lib/api/targets.ts` with `TargetInput`, `targetsQueryKey` and the wrappers over `apiRequest`; the generated `components['schemas']['TargetTestResult']` (`delivered: boolean`, `failure_reason?: string | null`) in `schema.d.ts`.
- `components/ui/Dialog.tsx`, and in `styles/components.css`: `.notice`, `.notice--ok`, `.notice--bad`, `.notice--muted`, `.hint`, `.plain-text`, `.btn`, `.spinner`.
- `testTarget` is real on the server (`test-target` is merged): `POST /api/services/{serviceId}/target-tests`.

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/alert-list/**` and `frontend/src/lib/api/targets.ts`, `targets.test.ts`. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `frontend/src/components/ui/**`, `frontend/src/styles/components.css`, `features/service-form/**`, `features/service-list/**`, `backend/**`, or `docs/**` (except your own plan file, `docs/tasks/target-test-row.plan.md`).

Shared files this task touches, all owned by this task while it runs: everything under `features/alert-list/` and `lib/api/targets.ts`. Tasks that may run at the same time: backend tasks and any frontend task outside `features/alert-list/` (`service-form-timing` changes `features/service-form/`). No other task changes `features/alert-list/`.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this dialog handles |
|---|---|---|
| `testTarget` | `POST /api/services/{serviceId}/target-tests` | 200 `TargetTestResult` (delivered or failed with a reason: both are 200); 422 `validation_failed` with `errors`; 404 `not_found` (the service is gone: the operation has no target id); 403 `csrf_failed`; 401 `unauthenticated` (the shell ends the session; nothing here); 400, 413, 415, 500 and any other failure, including a network error, as "something went wrong". Real on the server. |

The body is `TargetInput`, built exactly as for a save (`{ type: 'email', name, address }` or `{ type: 'webhook', name, url, headers }`). `X-CSRF-Token` is added by `apiRequest` for `POST`. A field error is `{ field, message, code }`, with the paths `createTarget` uses (`name`, `address`, `url`, `headers[i].name`, `headers[i].value`, `headers`).

## Behavior

### What exists

The dialog has the form (Name, Type, the contact, and for a webhook the warning and the header rows), a footer with `Cancel` and the primary button, a live region at the top with the `422` summary and the failure banners, and `useSaveTarget`, whose failure is a value (`field-errors`, `duplicate`, `full`, `not-found`, `csrf`, `unexpected`). Closing and Esc are blocked while a save is in flight. `lib/targetForm.ts` builds the request body (`toInput`) and compares two sets of values (`sameValues`). `lib/api/targets.ts` has no `testTarget`.

### The row

A `div.test-row` as the last child of the form's `stack`, after the contact field and, for a webhook, after the warning and the header rows, holding a button and a result area:

- **The button:** `btn` (the default look), Lucide `Send`, text `Send test alert`. It is a `type="button"` (it never submits the form). While a test is in flight it is `aria-disabled="true"` (not `disabled`, so that it keeps focus, as the confirming `Remove` of the alert list does), `aria-busy="true"`, ignores clicks, shows a spinning `LoaderCircle` (class `spinner`) instead of the icon and reads `Sending…`. At every other time, a save in flight included, it is enabled (the board's `Saving` state does not disable it; the form's fields are read-only then, so a test sends the values the save sends).
- **The result area:** `div.test-row__result` with `aria-live="polite"`, holding one of:

| State | Content |
|---|---|
| Nothing sent yet, or the last result no longer applies | `span.hint`: `Sends one alert to this target only, using the values above. Nothing is saved.` |
| Sending | `p.notice.notice--muted`: a spinning `LoaderCircle` and `Sending one test alert…` |
| Delivered | `p.notice.notice--ok`: Lucide `CircleCheck` and `Delivered.` |
| Failed (`delivered` false) | `p.notice.notice--bad`: Lucide `CircleAlert` and `Failed: ` followed by the server's `failure_reason`, as it is, in `span.plain-text` |

If a failed result has no `failure_reason` (null or absent) the text is `Failed.` alone.

### Sending a test

Pressing the button, in this order:

1. Clear the last failure of the dialog (the banner and the summary, whichever action left them) and the previous test result.
2. **Client check:** the active contact must be filled (not blank after trimming), with the messages of a save: `Enter an email address.` or `Enter a URL that starts with http:// or https://.` shown on the field. If it fails, focus goes to that field and nothing is sent (the Name and the headers are not checked). Nothing else is checked on the client.
3. Send `testTarget(serviceId, toInput(values))` for the values the form holds at that moment. The form stays editable; only the button is inactive (the board: "Only the test button is disabled"). `Cancel`, `Close`, Esc and the backdrop behave as when no request is in flight: a test never counts as saving, so with a changed form they open the discard question, and with an untouched one they close. If the dialog is closed or the page is left before the answer, the answer is dropped: no toast, no state, no outcome (a `404` after the dialog closed does not fetch the list), no list change.

The result is shown only while the form's values are the values it was sent with (`sameValues` of the current values and those of the request, a derived comparison with no stored marker): any edit afterwards (any field, the type, a header row), and any result that arrives after an edit, shows the hint instead; if the values are put back as they were sent, the result shows again. This applies to `Delivered.` and `Failed: …` only: a `422` summary, a banner and a `404` act on the answer whenever it arrives. A test never changes the form's values, its "changed" state, the leave guard, the cached list, the toasts or the saved target.

### Outcomes

| Result | Where it shows | Focus afterwards |
|---|---|---|
| 200, `delivered` true | the result area: `Delivered.` | not moved (the button keeps focus, being `aria-disabled` and not `disabled`) |
| 200, `delivered` false | the result area: `Failed: {reason}` | not moved |
| 422 `validation_failed` with errors | the summary and each field, exactly as for a save (the same summary, the same field messages, in the server's order); the result area shows the hint | the summary |
| 404 `not_found` | the dialog closes and the list is fetched again, as for an add (the service may be gone: the page then shows "service not found" and its `h2` takes focus, as `alert-list-screen` says), whether the dialog was an add or an edit | where the add rule puts it |
| 403 `csrf_failed` | the banner `The request wasn’t accepted.` with `Reload the page and try again.` and the button `Reload` | not moved |
| anything else: 500, 413, 415, 400, a network error, a 403 or 404 with another code or no problem body, a 422 with no errors or another code | the banner `Something went wrong.` with `The server couldn’t be reached or returned an error. Your values are still here.` and the button `Try again`, which sends the test again (not a save) | not moved |

The banners are the dialog's own (same texts, same live region); the banner's `Try again` repeats the action that failed: the test for a test failure, the save for a save failure. **One failure is shown at a time: the one of the action most recently started** (the dialog keeps which action that was, a UI choice, not server data); an older action's answer that arrives later is not shown (a save that succeeds still completes and closes the dialog). Starting a test or a save clears the failure and the summary of both. A `401` shows nothing here. The test's failure is a value derived from the request, as the save's is, and is not copied from the server into component state. The dialog handles a test's `not-found` itself (it closes) and never passes it to the banners, whose `not-found`, `duplicate` and `full` branches are the save's and do not change; the test's `422` goes through the same summary and field messages; `csrf` and `unexpected` through the same banners.

### Known gaps

- **A test during a save, and a save during a test, are both possible** (the board disables only the test button while it is testing); the late answer of a test after the dialog has closed is dropped, and of a save that has failed is shown only if the save is the action most recently started.
- **The result goes when the form changes,** even by a change that would not alter the test (the name, which the test alert does not carry); the rule is simple on purpose.
- **A 404 for a test always means the service is gone** (the operation has no target id), so for an edit the dialog closes and refreshes instead of showing "This target no longer exists." Typed values are lost without a message; the page's own "service not found" state follows if the service is gone. The outcome `gone`'s comment ("An add was answered 404") becomes stale and is updated.
- **No client check of the format:** the server's `422` says what is wrong, as for a save.
- **A failed test says nothing about the "last delivery failed" notice:** a test never changes it (FR-108).
- **`failure_reason` is the server's text** and is shown as it is; the board's example is `no SMTP account configured`.

## Structure

By `ARCHITECTURE.md`: the row belongs to the `alert-list` feature. Names marked "new" are fixed by this file; others are the builder's choice. One hook per concern, each with a colocated test written in the same step (`CONVENTIONS.md`).

- `frontend/src/lib/api/targets.ts` and `targets.test.ts`: add `testTarget(serviceId, input)` (`POST` to `/api/services/{id}/target-tests`, the id through `encodeURIComponent`, a thin wrapper over `apiRequest`) and the exported type `TargetTestResult` from the generated schema.
- `features/alert-list/hooks/useTestTarget.ts` (new, with a test): the request through a mutation that has no `onSuccess` effect on any cache and shows no toast; exposes whether it is in flight, the last request's input and result (derived from the mutation, not copied), the failure as a value (`field-errors`, `not-found`, `csrf`, `unexpected`; a new object for every failure; none for a `401`), `clear()` (drops the last result and failure; does nothing while in flight, as `useSaveTarget`'s `clearFailure`) and `run(input)` (does nothing while in flight; resolves when answered).
- `features/alert-list/components/TargetTestRow.tsx` (new, with a test): the row (button, hint, sending, delivered and failed states) over plain props (in flight, the result to show or none, `onSend`, a ref to the button), no request code.
- `features/alert-list/components/TargetDialog.tsx` (and test): places the row, keeps which action was started last and shows that action's failure in the live region (the focus effect and the field errors key off the shown failure), runs the client check for the contact with the form library's `trigger` on the active contact field with focus (the same `validate` rules and messages as the save, no second copy), sends through `useTestTarget`, decides when the result applies (`sameValues`), moves focus as the table says, and closes the dialog for a test's `404`; updates the `gone` comment; clears both hooks when either action starts.
- `features/alert-list/components/TargetDialogBanners.tsx`: takes the failure to show and the action `Try again` repeats; its texts do not change.
- `features/alert-list/hooks/useTargetServerErrors.ts` (and test): takes the errors of whichever failure is current (no change of its shape).
- `features/alert-list/alert-list.css`: copy from `docs/design/alerts.css` (values and rules only) `.test-row`, `.test-row__result` and its 640 px rule `.test-row .btn { width: 100% }`.

No new package, shared component, dependency or configuration.

## Design reference

Reference only, read-only: `docs/design/alerts.html` (the states "Test sending", "Test delivered", "Test failed" and the idle row inside every dialog state) with `docs/design/alerts.css` and `components.css`. Copy values and rules from the styles; never copy board markup or component code. Use the project's `.notice` and `.btn` rules and Lucide icons only (`Send`, `LoaderCircle`, `CircleCheck`, `CircleAlert`; if one is missing in the installed version use the closest and say so in the plan). Where the board and the contract disagree the contract wins.

Texts copied from the board as written: `Send test alert`, `Sending…`, `Sends one alert to this target only, using the values above. Nothing is saved.`, `Sending one test alert…`, `Delivered.`, `Failed: {reason}`.

Texts decided here (not drawn): `Failed.` for a failed result with no reason; the rule that the result goes when the form changes; that the banner's `Try again` repeats the test for a test failure (the banner texts are the dialog's existing ones); that a `404` closes the dialog as an add does; the focus rules; and one deviation from the board: while testing the button is `aria-disabled` instead of `disabled`, so that it keeps focus (the same pattern as the confirming `Remove`). The user may list it in `docs/design/README.md`.

## Dependencies

None. `@tanstack/react-query`, `react-hook-form` and `lucide-react` are installed; `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Mock `testTarget`, `createTarget`, `updateTarget`, `listTargets` and `listServices` at the wrapper boundary with value-return spies, typed through the fixtures, keeping the real `targetsQueryKey` (the pass-through form the existing dialog tests use). A request that answers late is a promise the test resolves. A rejection that stands for a problem response uses the `problem(status, code)` and `validationProblem(...)` fixtures. Use `user-event`.

**`lib/api/targets.ts`**

- `testTarget('s1', input)` calls `apiRequest('POST', '/api/services/s1/target-tests', input)` once; an id with a space and a slash is encoded; a rejection reaches the caller unchanged (NFR-8).

**`useTestTarget`** (a real query client)

- A 200 with `delivered: true` and one with `delivered: false` and a reason are results, not failures; the cached list under `targetsQueryKey` is not read or written, no toast shows, and `createTarget` and `updateTarget` are not called (FR-108).
- 422 gives `field-errors` with the errors in order; 404 gives `not-found`; 403 `csrf_failed` gives `csrf`; a 500, a network `TypeError`, a 413, a 403 with another code and a 404 with no problem body give `unexpected`; 401 gives no failure. Each failure is a new object when the kind repeats. A second `run` while one is in flight sends nothing.

**`TargetTestRow`**

- Idle: a button `Send test alert` (with its icon) and the hint text; enabled. In flight: the button is disabled, `aria-busy`, reads `Sending…` with a spinner, and the result area shows `Sending one test alert…`. Delivered shows `Delivered.`; failed shows `Failed: no SMTP account configured`; a failed result with no reason shows `Failed.`; the reason with `<b>x</b>` shows as text and no `b` element exists (NFR-7). The result area is `aria-live="polite"`.

**The dialog (`TargetDialog.test.tsx`, rendering the page's `AlertList` with the dialog)**

- The row is the last element of the dialog's body for an email and for a webhook (after the header rows and the warning); in add and in edit; the button is after the last field in the Tab order and works with Enter and Space (NFR-4).
- Email: with an address typed, pressing the button calls `testTarget` once with the service id and `{ type: 'email', name, address }` as typed (the `name` is `''` when empty); while pending the button is `aria-disabled`, `aria-busy` and reads `Sending…`, a second press sends nothing, the form is still editable, the footer's primary button is still enabled, and `Cancel`, `Close` and Esc are not blocked (with the address typed the form is changed, so they open the discard question, which the test asserts; with an untouched form they close); a delivered answer shows `Delivered.` and a failed one `Failed: {reason}`; the button still has focus afterwards (it was never `disabled`) (FR-107).
- Webhook: the body is `{ type: 'webhook', name, url, headers }` with the rows in order (`headers: []` with none), and the fields of the other type are not sent (FR-107).
- Client check: with a blank email address or a blank URL, the message of a save shows on the field, focus is on it, `testTarget` is not called, and editing the field clears the message; a blank Name or empty header rows do not stop the test (FR-108).
- Nothing is saved: after a delivered or a failed test, `createTarget`, `updateTarget` and `listTargets` are not called, the list behind the dialog and the sub line are unchanged, no toast shows, and the footer's `Add target` button, the form's values and the leave guard behave as before the test (an untouched form still closes at once on `Cancel`; a changed one still asks) (FR-108).
- The result applies only to the values it was sent with: after a result, editing the name, the contact, the type or a header row shows the hint; putting the values back as they were sent shows the result again (it is derived); a result that arrives after an edit is not shown; sending again after an edit shows the new result.
- A test pressed while a save is in flight is sent (the button is enabled then); a save pressed while a test is in flight sends the save. The late answer of a test, after the dialog has closed, shows nothing, calls nothing and, for a `404`, does not fetch the list (without the guard the handler would call the dialog's outcome or set state). When a save and a test both fail, only the failure of the action started last is shown.
- 422: the summary shows exactly as for a save (title, entries `{label}: {message}`, links), each field shows its message, focus is on the summary, the result area shows the hint, and editing a field clears its message and entry (FR-82, FR-89, FR-110); a following successful test clears the summary.
- 404: the dialog closes, `listTargets` is called again, and when it answers 404 the page shows "service not found" with its `h2` focused; the same for an edit dialog, which shows no "This target no longer exists." banner.
- 403 `csrf_failed`: the banner `The request wasn’t accepted.` with `Reload`, which calls `window.location.reload` once; focus is not moved (NFR-8). A 500 and a network error: the banner `Something went wrong.` with `Try again`, the values still in the inputs, and `Try again` sends the test again, not a save (`testTarget` called twice, `createTarget` not called).
- A save failure's banner `Try again` still repeats the save; a new test clears a save failure's banner and summary, and a new save clears a test failure's banner and summary.
- 401 `unauthenticated`: the shell's sign-in form; no banner, no result.
- Replaced on purpose: `TargetDialog.test.tsx`'s case that says there is no `Send test alert` control (the `queryByText(/Send test alert/)` assertion in the idle test of the Add dialog) now expects the row. Every test file that renders the dialog and mocks `lib/api/targets` (`TargetDialog.test.tsx`, `AlertList.test.tsx` and any other) adds `testTarget: vi.fn()` to its mock factory; those are setup changes. Nothing else in the existing tests is loosened.
- Test data: `TargetTestResult` values are schema-typed literals in the tests (`test/fixtures.ts` has no fixture for it and is not changed); a `404` with no problem body is `new ApiError(404, null, null)` (the `problem(...)` fixture always has a body).

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

## Verifier checks

- **By reading `useTestTarget.ts`:** the mutation has no cache write, no toast and no list refetch on success; failures are chosen by `ApiError.status` and `code`, never by message text; a 401 shows nothing; the result and failure are derived from the request, not copied into state.
- **By reading `TargetDialog.tsx`:** the body is built by the same `toInput` as the save; the client check is only "the active contact is filled", through the existing `validate` rules (no second copy of them); the result is shown only when `sameValues` of the current values and the request's holds; the test does not touch the leave guard, `saving`, or the footer's button; closing is not blocked by a test; a `404` closes the dialog for both add and edit.
- **By reading the components:** `TargetTestRow` has no request code; the reason is a React text child in `span.plain-text` (no `dangerouslySetInnerHTML`); the button is `type="button"`; icons from Lucide only; every string of the row is defined once and used from there, with the `…` and the curly apostrophe as written.
- **Keyboard, by reading:** the row is last in the form's Tab order before the footer; focus returns to the button when a test ends, and goes to the summary after a `422`; the result area is a polite live region.
- **Layout, by reading the CSS (jsdom cannot prove it):** `.test-row` wraps; the button is full width at the board's 640 px breakpoint; the rules are copied values, no literal colour or pixel value where a token exists.
- **Contract:** the body matches `EmailTargetInput` or `WebhookTargetInput`; the statuses handled are those the contract lists for `testTarget` plus "anything else"; `delivered` false is a 200 and is not treated as an error.
- **Mutation checks to run:** save the target on a test; show a toast or write the cache on success; send the fields of the other type; skip the client check; check the Name; keep the result after an edit; show a result that arrived after an edit; disable the whole form while testing; block closing while testing; make `Try again` save after a test failure; treat `delivered` false as an error; render the reason as HTML; lose focus after the test; close the dialog on a 422; show the edit's "This target no longer exists." banner for a test 404. Each must fail at least one named test.
- **Inputs to try:** an email with no SMTP account (`Failed: no SMTP account configured` from the server); a webhook to a refusing receiver; a blank address; a test then an edit then a test; a test then Cancel while it is pending; a test during a save; a 422 followed by a corrected test; a 404 on an edit dialog; a reason with markup.
- **What the verifier cannot prove:** the look at 360 px and a real delivery; the milestone's end-to-end journeys and the manual check do; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design boards or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a shared component, an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- `target-form-dialog` or `test-target` is not merged, or a name this file takes from them is missing.
- `testTarget` does not answer as the contract says (a different status or shape).
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
