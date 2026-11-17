# Task: delete service dialog

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

Each row on the dashboard gets a Delete button. It opens a confirmation that names the service and says how many notification targets go with it. Confirming deletes the service, closes the dialog, removes the row and shows a toast; the failures show a toast too. This is the screen half of deleting a service; the server half (`deleteService`) is already built.

The task also adds the alert-dialog wrapper that the board's confirmation needs (the add-service task left it to this one), and the `Actions` column of the list, which holds only this one button until the tasks for the other row actions add theirs.

Requirements covered:

- FR-8: the admin can delete a service, from the dashboard.
- FR-72: the admin must confirm first; the dialog names the service and the number of its notification targets, and nothing is sent until the admin confirms.
- NFR-4, in part: the dialog starts on Cancel, Esc cancels, Tab stays inside it and focus goes back to the button that opened it (the full keyboard journeys are in the milestone 5 end-to-end suite).
- NFR-7: the service name in the title, the button label and the dialog is plain text.
- NFR-8, in part: the request goes through `apiRequest`, which sends the CSRF token; a `403 csrf_failed` is shown as the board's "request wasn’t accepted" toast.

Out of scope:

- Pause, Resume, Alerts and Edit buttons, the name as a link to Edit, the public-page switch and the "Open public page" link. Each comes with its own task (see the backlog). The `Actions` column built here holds only Delete.
- The server side of `deleteService`. It is built and merged (`list-and-delete-services-api`); this task runs against mocks.
- The alert list screen and `listTargets`. The count comes from `Service.target_count` in `listServices`; the dialog makes no other request and has no "counting" state (`docs/design/README.md`).
- Any undo, and a "type the name to confirm" step. The board has neither.
- The `Reload` toast text for `csrf_failed` is also written in `SessionProvider.tsx`. This task does not refactor that file.
- End-to-end tests. The milestone's last task writes them.

## Prerequisite

`add-service-screen` is merged to the default branch. It adds the exported query key `servicesQueryKey` and the `createService` wrapper to `frontend/src/lib/api/services.ts`,. The builder branches from `origin/main` and checks that `servicesQueryKey` exists in `lib/api/services.ts`; if it does not, it stops and says so, and creates neither.

## Role and ownership

Role: Frontend.

You may change `frontend/src/**`. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `backend/**`, `docs/**` (except your own plan file, `docs/tasks/delete-service-dialog.plan.md`), or anything else outside `frontend/src/`. Do not change `components/ui/Dialog.tsx`, `Toast.tsx` or `useToast.ts`; they are used as they are.

Shared files this task touches, all owned by this task while it runs:

- `frontend/src/lib/api/services.ts`: adds `deleteService`.
- `frontend/src/test/fixtures.ts`: only if a test needs a helper that is not there (none is expected: `makeService` takes a `target_count`).
- `frontend/src/App.test.tsx`: only for the changes under "Tests this task changes on purpose".

Tasks that may run at the same time: `targets-api`, backend only. No other frontend task runs beside this one; the milestone 1 end-to-end task (the backlog's "Milestone journeys" row) waits for this one.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `deleteService` | `DELETE /api/services/{serviceId}` | 204 (deleted); 401 `unauthenticated` (the app shell ends the session, see below); 403 `csrf_failed`; 404 `not_found`; 500 `internal_error`; and any other failure, including a network error, as a generic failure. Real on the server |
| `listServices` | `GET /api/services` | Unchanged. `Service.target_count` (integer, 0 or more) and `Service.name` and `Service.id` are what this task reads from it |

The request carries no body and no query. `X-CSRF-Token` is added by `apiRequest` for a `DELETE`. The contract lists no 429, 409 or other status for this operation.

## Behavior

### What exists

- `apiRequest` throws `ApiError` for a non-2xx response; on `401` with code `unauthenticated` it first calls the handler the session provider registered, which ends the session and shows the sign-in form. A 204 resolves to `undefined`. A network failure rejects with the fetch error, which is not an `ApiError`.
- `components/ui/Dialog.tsx` is a plain dialog (role `dialog`). The board's confirmation is an alert dialog, so this task adds a wrapper for it.
- `components/ui/Toast.tsx` and `useToast()` give `show({ kind, message, action? })`. An error toast stays until dismissed; a success toast goes after 5,000 ms.
- `ServiceRow` draws data only. `ServiceList` takes one prop, `view`. The grid has six columns, with no `Actions` column.
- `styles/components.css` already has `.dialog*`, `.dialog-backdrop`, `.btn--danger` and `.btn--ghost-danger`. `.btn--icon` and the `.spinner` rule exist too.

### The Delete button

Each row has an `Actions` cell at the end holding one button: `btn btn--ghost-danger btn--icon`, with the Lucide `Trash2` icon (decoration only), `aria-label="Delete {name}"` (the service's name, as text), and a `.btn__label` span `Delete` that is `aria-hidden` and visible only in the 360 px card layout, as the board has it. It is shown for every service, paused or not, and in every row state. Clicking it opens the dialog for that service; it does not send a request.

The list's column header gets a seventh word, `Actions`, aligned to the right and hidden from assistive technology like the rest of the header.

### The dialog

Opened by the row's Delete button. It holds the `Service` of the row as it was when the button was clicked (a snapshot): a refresh of the list while the dialog is open does not change its text, and does not close it. It is an alert dialog (role `alertdialog`, over Base UI's alert dialog in the new wrapper below), 440 px wide.

| Part | Content |
|---|---|
| Title (the dialog's accessible name) | `Delete “{name}”?`, with `{name}` as a plain text child (it wraps; the title already breaks anywhere) |
| Body (the dialog's accessible description), first paragraph | `target_count` 2 or more: `Its alert list goes with it: ` + bold `{n} notification targets` + `.`. Exactly 1: `Its alert list goes with it: ` + bold `1 notification target` + `.`. 0: `It has no notification targets.` |
| Body, second paragraph | `Checks stop and its current state is removed. This can’t be undone.` |
| Footer, in this order | `Cancel` (default button style), then `Delete service` (`btn btn--danger`, Lucide `Trash2`) |

Focus starts on `Cancel`. Tab cycles inside the dialog. At 360 px the buttons stack with `Delete service` above `Cancel` (the existing `.dialog__foot` rule does this; do not change the DOM order).

Closing without deleting: `Cancel` and Esc close it and send nothing. A click on the backdrop does nothing (alert dialog behavior). Focus returns to the Delete button that opened it.

**Deleting** (the request in flight): `Cancel` is disabled; `Delete service` is disabled, has `aria-busy="true"`, shows a spinning `LoaderCircle` (class `spinner`) in place of the `Trash2` icon and reads `Deleting…`. Esc and a click on the backdrop do nothing. A second click on `Delete service` cannot send a second request.

### Outcomes

The result of the request, in the order the checks are made: a `401 unauthenticated` first (nothing here; the shell ends the session), then by status and code.

| Result | Dialog | List | Toast | Focus |
|---|---|---|---|---|
| 204 | closes | the service is removed from the cached list (see below) | success, `Service deleted.` | the page heading (`h1`) |
| 404 with code `not_found` | closes | the service is removed from the cached list, as for 204 | error, `That service was already deleted.` | the page heading |
| 403 with code `csrf_failed` | closes | unchanged | error, `The request wasn’t accepted. Reload and try again.` with an action button `Reload` that calls `window.location.reload()` | back to the Delete button |
| 401 with code `unauthenticated` | closes | the shell has replaced the page with the sign-in form | none | none |
| anything else: 500, a network error, a 403 or 404 with another code or with no problem body, any other status | closes | unchanged | error, `Couldn’t delete the service. Try again.` | back to the Delete button |

The toasts are the app's (`useToast`). `Reload` closes its toast like any toast action.

The dialog never stays open after an answer. After a failure the row is as it was and the admin can click Delete again.

**Focus after the row is gone.** The opener no longer exists after a 204 or a 404, so focus goes to the `h1` `Services` (give it `tabindex="-1"`; it is not in the Tab order). In every other close focus goes back to the Delete button of that row (the wrapper's default).

**Removing the service from the list.** On a 204 or a `not_found` 404, the cached list under `servicesQueryKey` is changed in place; the list is not refetched:

1. An in-flight request for that list is cancelled first, so that a refresh that started before the delete cannot put the row back when it answers.
2. The service with that `id` is taken out of the cached array; every other service keeps its object and its position. If the cache has no list (it was removed, for example when a session ended), nothing is written and no entry is created.
3. The time of the last successful load is kept as it was (`setQueryData` with `updatedAt` set to the entry's current `dataUpdatedAt`), so that `Updated HH:MM:SS` and `Showing data from {time}` still describe the last real response.

The screen follows from the existing derivation: the heading line shows the new count, and removing the last service shows the Empty block (`No services yet`).

**Timing.** The cache change and the toast happen whether or not the dashboard is still mounted when the answer arrives (for example the admin pressed Back during the request). They belong to the hook's mutation options, not to callbacks passed at the call.

**One at a time.** The dialog is modal, so only one delete is in flight; `confirm` while a request is in flight does nothing.

### Known gaps

- **The target count is as of the last list load.** The dialog does not refetch it when it opens (the README: the dialog has no "counting" state). If targets were added or removed since, the number is off; the server deletes whatever exists.
- **The `Actions` column holds one button.** It keeps the board's 132 px width so that the Pause, Alerts and Edit tasks add buttons without moving the other columns. Until then the cell is mostly empty on wide screens.
- **The `csrf_failed` toast text and its `Reload` action are written twice** (`SessionProvider.tsx` and the delete hook). Share them when a third place needs them.
- **The `1 notification target` wording** is not drawn on the board (it draws 3 and 0) and is decided here.
- **A failed delete leaves no trace in the dialog.** The dialog closes and the toast is the only message, by the user's decision.
- **Skeleton rows are unchanged.** They have no Actions placeholder.

## Structure

By `ARCHITECTURE.md`: the delete confirmation belongs to the `service-list` feature. Names marked "new" do not exist yet and are fixed by this file; other names are the builder's choice.

- `frontend/src/lib/api/services.ts`: add `deleteService(id)`, a thin wrapper over `apiRequest('DELETE', …)` returning `Promise<void>`, with the id encoded for the path (`encodeURIComponent`). Add a doc comment in the style of its neighbours. Add `lib/api/services.test.ts` (new) for it.
- `frontend/src/components/ui/AlertDialog.tsx` (new) and `AlertDialog.test.tsx` (new): a wrapper over `@base-ui/react/alert-dialog`; only this file imports it. Same props and shape as the existing `Dialog` wrapper (`open`, `title`, `onClose`, `busy`, `initialFocus`, `children`, `footer`), plus an optional `finalFocus` passed through to the popup. The body is rendered inside the Base UI description part (rendered as a `div`, not a `p`) so that the dialog's `aria-describedby` points at it. Esc calls `onClose` unless `busy`; a click on the backdrop does not call it. It uses the same `.dialog-layer`, `.dialog-backdrop`, `.dialog`, `.dialog__head`, `.dialog__title`, `.dialog__body` and `.dialog__foot` classes. This is a new wrapper, not a change to `Dialog.tsx`, because Base UI's alert dialog is a separate component with its own roles and dismissal rules.
- `frontend/src/features/service-list/hooks/useDeleteService.ts` (new) with a colocated test: the delete flow of one service, from the click to the outcome. Returns the service being asked about (or null), whether a request is in flight, how the dialog last closed (`removed` after a 204 or a not-found 404, otherwise `kept`; null before the first close), and the mutators `ask(service)`, `cancel()` and `confirm()`; no raw setters, no query objects. `confirm` with no asked service does nothing. `ServiceList` passes the wrapper a `finalFocus` function that returns the `h1` when the last close was `removed` and otherwise lets the wrapper's default return focus to the opener (the existing `Dialog` wrapper's default already does this, as its test shows). It owns the mutation, the cache change and the toasts above. The wording lives only here (the `Reload` text duplicates `SessionProvider`, see Known gaps).
- `frontend/src/features/service-list/components/DeleteServiceDialog.tsx` (new) with a colocated test: the title, body and footer above, over `AlertDialog`. Takes the service, the in-flight flag and the handlers as props; no request logic.
- `frontend/src/features/service-list/components/ServiceRow.tsx`: gains the `Actions` cell and an `onDelete(service)` prop.
- `frontend/src/features/service-list/components/ServiceList.tsx`: gains a `deletion` prop (the hook's result), the `Actions` header word, the `DeleteServiceDialog`, and the heading's `tabindex="-1"` and focus move. It still imports nothing from `app-shell/` or another feature.
- `frontend/src/pages/DashboardPage.tsx`: calls `useServiceList` and `useDeleteService` and passes both to `ServiceList`.
- `frontend/src/features/service-list/service-list.css`: copy from `docs/design/dashboard.css` (values and rules only) the seventh grid column (`132px`) in the wide template, `.svc__actions`, `.svc__actions .btn__label`, and in the 640 px block the `actions` grid area, `.svc__actions` and its `.btn` and `.btn__label` rules. Leave out everything that belongs to the buttons of other tasks (`.public-toggle*`, tooltip rules).
- **Mocks of `lib/api/services`.** `servicesQueryKey` is an array, and a plain `vi.mock` automock turns an array into `[]`, so the hook would write to another key than `useServiceList` reads. Every test that mocks this module and reaches the hook (`ServiceList.test.tsx`, `App.test.tsx`, `useDeleteService.test.tsx`) uses the pass-through form that `useCreateService.test.tsx` has on the add-service branch: `vi.mock(path, async (importOriginal) => ({ ...(await importOriginal()), listServices: vi.fn(), deleteService: vi.fn() }))`. `useServiceList.test.tsx` need not change.
- `frontend/src/features/service-list/hooks/useServiceList.ts` stays as it is. Use `servicesQueryKey` from `lib/api/services.ts` in the new hook, not the feature's own `SERVICES_KEY` copy.

## Design reference

Reference only, read-only: `docs/design/dashboard.html` (states Delete confirmation, Delete confirmation: no targets, Deleting, Action failed) and `docs/design/dashboard.css`; `docs/design/index.html` ("Destructive actions and confirmations"); `docs/design/README.md` for where the boards differ from what is built (the delete dialog's count comes from `listServices`, with no "counting" state). Copy values and rules from the styles into the project's CSS; never copy board markup or component code. Use the `components/ui/` wrappers and the new alert-dialog wrapper; icons from Lucide only. Where the board and the contract disagree the contract wins.

Texts the board draws, copied as written: the title, both body variants (3 targets and none), `Cancel`, `Delete service`, `Deleting…`, `Service deleted.`, `That service was already deleted.`, and `The request wasn’t accepted. Reload and try again.` with `Reload`. Texts decided here: `1 notification target` (singular), and `Couldn’t delete the service. Try again.` for every other failure. By the user's decision a failed delete closes the dialog and shows a toast; the board does not draw this. The focus move to the heading after a removal is also decided here (the board names only the return to the Delete button).

## Dependencies

None. `@base-ui/react` 1.9.0 (with its alert dialog and toast), `@tanstack/react-query` 5.107.1 (`setQueryData` takes `updatedAt`), `lucide-react` 1.73.0 are installed; `package.json` and the lockfile do not change. `Trash2` and `LoaderCircle` exist in Lucide 1.73.0. If an icon is missing, use the closest and say so in the plan.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Mock `listServices` and `deleteService` at the wrapper boundary with value-return spies, typed with the generated types through the fixtures. A request that answers late is a promise the test resolves. Time-driven tests use fake timers with `fireEvent` (`user-event` hangs there); other tests use `user-event`. A rejection that stands for a problem response uses the `problem(status, code)` fixture.

**`deleteService` (`lib/api/services.test.ts`, mocking `./request`)**

- It calls `apiRequest('DELETE', '/api/services/abc')` once and resolves to `undefined`; an id with a space and a slash is encoded in the path; a rejection from `apiRequest` reaches the caller unchanged (NFR-8).

**`AlertDialog` (`components/ui/AlertDialog.test.tsx`)**

- It has role `alertdialog`, is named by its title and described by its body (`aria-describedby` resolves to the body text); focus starts on the `initialFocus` element and not on the first focusable one.
- Esc calls `onClose` once and focus goes back to the opener; a click on the backdrop does not call `onClose`; with `busy`, Esc does nothing; the footer renders (NFR-4).
- With `finalFocus` given, focus goes there on close instead of the opener.

**`useDeleteService` (`hooks/useDeleteService.test.tsx`, a real query client with a seeded `['services']` entry)**

- `ask` sets the service and `cancel` clears it without a request; `confirm` calls `deleteService` once with the id, is in flight until the promise settles, and a second `confirm` while it is in flight sends nothing (FR-72).
- 204: the cached list loses exactly that service, the others keep their objects and order, `dataUpdatedAt` is the value it had before, `listServices` is not called, the success toast `Service deleted.` is shown, and the asked service is null (FR-8). Deleting the last one leaves `[]`.
- A list request in flight when the 204 arrives is cancelled: a refetch started before `confirm`, resolving afterwards with the old list, does not bring the service back.
- 404 `not_found`: the same removal, and the error toast `That service was already deleted.`
- 403 `csrf_failed`: the cache is unchanged; the error toast has the text above and a `Reload` action; clicking it calls `window.location.reload` once (the test replaces `window.location` with an object holding a spy and restores it) (NFR-8).
- A 500, a network error (a plain `TypeError`), a 403 with another code, a 404 with no problem body (`new ApiError(404, null, null)`; the `problem` fixture always builds a body) and a 404 with another code each give the error toast `Couldn’t delete the service. Try again.`, leave the cache as it was and clear the asked service.
- 401 `unauthenticated` shows no toast and clears the asked service.
- With no `['services']` entry in the cache a 204 does not create one.
- Unmounting the hook's component while the request is in flight and then resolving 204 still removes the service from the cache and shows the toast.

**The dialog component (`components/DeleteServiceDialog.test.tsx`)**

- The title is `Delete “API gateway”?`; the body shows `3 notification targets` in bold with the first paragraph's text, `1 notification target` for 1, and `It has no notification targets.` for 0; the second paragraph is always there (FR-72).
- A name of `<b>x</b>` appears as text in the title, and no `b` element is created (NFR-7).
- `Cancel` has focus on open. `Delete service` is a button with the `Trash2` icon; while `deleting` is true both buttons are disabled and `Delete service` reads `Deleting…` with `aria-busy="true"`.

**The screen (`components/ServiceList.test.tsx`, with the real `useDeleteService`, see the helper below)**

- Every row has one button named `Delete {name}` (also for a paused row and for a TCP row) and no other button; the visible text of the button is `Delete` in a `.btn__label` that is `aria-hidden`; the column header words are the six it had and `Actions`.
- Clicking `Delete {name}` opens the alert dialog for that row and sends no request; with two rows, each opens its own name and count.
- `Cancel` closes it with no request and focus is back on that row's Delete button; Esc does the same; a click on the backdrop leaves it open (NFR-4).
- `Delete service` sends one request with that service's id; while pending the dialog stays with both buttons disabled and `Deleting…`, Esc does nothing, and a second click sends no second request.
- After a 204: the dialog is gone, that row is gone, the other rows are in the same order, the heading line shows the new count (`3 services` to `2 services`, `2 services` to `1 service`), the toast `Service deleted.` is shown, and `document.activeElement` is the `h1` (FR-8). Deleting the only service shows the Empty block and its two `Add service` links.
- After a 404 `not_found`: the same removal and focus, with the toast `That service was already deleted.`
- After a 403 `csrf_failed`, a 500 and a network error: the dialog is gone, every row is still there, the right toast is shown, and focus is back on that row's Delete button (the `Reload` button exists only for the 403).
- The dialog's text does not change when a refresh brings another `target_count` for the same service while it is open; when a refresh removes the service while the dialog is open, the dialog stays, and a confirm answered 404 gives the already-deleted toast.
- The list's `Updated {time}` meta shows the last real response's time after a removal, not the time of the delete.

**The app (`App.test.tsx`)**

- A delete answered `401 unauthenticated` (the mock runs the registered unauthenticated handler before it rejects, as `apiRequest` does) ends on the sign-in form with the session-ended notice and no toast, and the cached `['services']` data is gone (FR-4).

Tests this task changes on purpose:

- `ServiceList.test.tsx`, "has no row buttons, switch, Open link or row links; only the two Add service links are links": it now allows the one Delete button in each row and still fails on a `Pause`, `Resume`, `Alerts` or `Edit` button, a switch, an `Open` link and a row link. The `within(list).queryByRole('button')` assertion becomes "one button per row, named Delete". Nothing else in it is loosened.
- `ServiceList.test.tsx`: the render helper renders `DashboardPage`'s composition (the real `useServiceList` and `useDeleteService`) inside a `ToastProvider` and a query client, because `useToast` throws outside one; toasts are read from the page by text. The mock of `lib/api/services` becomes the pass-through form above. The test that lists the column header words gains `Actions`.
- `App.test.tsx`: if it asserts that no Delete button exists, or counts buttons on the dashboard, it follows the same rule. Its mock of `./lib/api/services` is the pass-through form above (on `main` it is a plain automock; the add-service task changes it), with `deleteService` given an answer by any test that reaches a delete.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

## Verifier checks

- **By reading `useDeleteService.ts`:** the cache change is `setQueryData` on `servicesQueryKey` with `updatedAt` kept, after `cancelQueries`; no `invalidateQueries` or refetch on success; the toasts and the cache change are in the mutation's options, not in a callback passed to `mutate`; the cases are chosen by `ApiError.code`, never by message text; a 401 shows nothing; server data is not copied into component state.
- **By reading the components:** no `dangerouslySetInnerHTML`; the name is a React text child in the title, the button label and the `aria-label`; only `components/ui/AlertDialog.tsx` imports Base UI's alert dialog; `Dialog.tsx` is unchanged; no hand-written dialog or toast; icons from Lucide only; no literal colour and no pixel value in a rule where a token exists, other than values copied from `docs/design/dashboard.css`.
- **Wording, by reading:** every string in the Outcomes table and the dialog table appears exactly once in the code (the `Reload` text also in `SessionProvider.tsx`, as noted), with the curly quotes, apostrophes and the ellipsis as written here.
- **Keyboard, by reading:** the Delete button is a `button` in the Tab order after the row's other controls; the dialog's initial focus is `Cancel`; the footer DOM order is `Cancel` then `Delete service`; the `h1` has `tabindex="-1"`; the disabled buttons use `disabled`.
- **Layout, by reading the CSS (jsdom cannot prove it):** the wide grid has seven columns with `132px` last; the 640 px block has the `actions` area under `check change`, `.svc__actions .btn__label` is visible there and visually hidden above it; the footer stacks with `Delete service` on top at 360 px by the existing rule.
- **Inputs to try:** a service whose name is 100 characters with no spaces, in the title (wraps, no sideways scroll); `target_count` 0, 1, 2 and 5; the last service of the list; a delete answered 404 after a refresh already removed the row; a delete whose answer arrives after a list refresh that started before it; Esc and backdrop clicks while deleting; two failures in a row (two toasts); a paused service; the dialog opened, the session ending by a 401 on a refresh.
- **Contract:** every field read exists in `components['schemas']['Service']`; the statuses handled are those the contract lists for `deleteService` plus "anything else".

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design boards or this file conflict with each other.
- You think you need a change outside your paths, a dependency, an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- `servicesQueryKey` is not in `lib/api/services.ts` (the Prerequisite).
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.
- Base UI's alert dialog cannot give what "The dialog" and the wrapper describe (no backdrop dismissal, `initialFocus`, `finalFocus`, a description part), or `setQueryData` does not keep `updatedAt`.
- An icon name above does not exist in Lucide 1.73.0 and no close match exists.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
