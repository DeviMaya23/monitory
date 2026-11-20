# Task: dashboard pause and resume

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

Each row on the admin dashboard gets a Pause button, which becomes Resume while the service is paused. There is no confirmation. A click sends `pauseService` or `resumeService`; on the answer the row switches to its new state (Paused, or its stored status again) and a toast confirms. The failures show a toast and the row keeps its last known state. This is the screen half of pausing a service; the server half (`pauseService`, `resumeService`) is a separate backend task.

Requirements covered:

- FR-75: the admin can pause and resume a service, from the dashboard.
- FR-76, in part: the Pause button sends the pause; stopping the checks and alerts and cancelling a running check is the server's. The screen shows the toast `Checks and alerts stopped.`
- FR-77: a paused service shows as paused on the dashboard (the badge and the Paused public flag already exist); after a pause or resume the row shows the server's answer, not a guess.
- FR-78: the row keeps its state across a pause and a resume: the screen shows `last_checked_at`, `last_status_change_at` and the failure reason of the server's answer and changes nothing else about them.
- FR-79, in part: the Resume button sends the resume; the immediate check is the server's. The screen shows the toast `Checking now.`
- Keyboard use (the requirement NFR-4 does not list dashboard rows; the board draws the order): the button comes after the service name and before Alerts and Delete in the Tab order; it has a name that includes the service's name; the button keeps focus when it becomes Resume (the full keyboard journeys are in the milestone 5 end-to-end suite).
- NFR-7: the service name in the button's name and in the toasts is plain text.
- NFR-8, in part: the requests go through `apiRequest`, which sends the CSRF token; a `403 csrf_failed` is shown as the board's "request wasn’t accepted" toast with Reload.

Out of scope:

- **The server side of `pauseService` and `resumeService`:** the backend task `pause-resume-api`. Until it merges the server answers `501`. This task runs against mocks. The user should merge the backend task before the milestone's manual check.
- **Edit, the name as a link to Edit, the public-page switch and the "Open public page" link:** their own tasks (backlog; Edit is built by the edit-screen task, the switch and the link in milestone 4).
- **Pausing from the edit form or anywhere else.** The board has Pause and Resume only on the dashboard row.
- **A confirmation, an undo, a spinner, a bulk pause.** The board draws none.
- **An optimistic change.** The row changes when the server answers, not before (see "Decisions").
- **End-to-end tests.** The milestone's last task writes them.

## Prerequisite

`delete-service-dialog` and `dashboard-screen` are merged (they are). The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- In `frontend/src/features/service-list/`: `components/ServiceList.tsx` (props `view` and `deletion`), `ServiceRow.tsx` (props `service`, `now`, `onDelete`), `StatusBadge.tsx`; `hooks/useServiceList.ts`, `useDeleteService.ts` (with its private `removeFromList`, and the toasts `That service was already deleted.`, `The request wasn’t accepted. Reload and try again.` with a `Reload` action, and `Couldn’t delete the service. Try again.`); `service-list.css` with `.svc__actions`.
- `frontend/src/pages/DashboardPage.tsx` composing `ServiceList` with `useServiceList()` and `useDeleteService()`.
- `frontend/src/lib/api/services.ts` with `servicesQueryKey`, `Service`, `ServiceList` and `deleteService`; `lib/api/request.ts` (`apiRequest`) and `ApiError`.
- `components/ui/useToast.ts` (`show({ kind, message, action? })`).
- `test/fixtures.ts` with `makeService`, `makePaused`, `makeTcp`, `makeServiceList`.

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/service-list/**`, `frontend/src/pages/DashboardPage.tsx`, `frontend/src/lib/api/services.ts` (only to add the two wrappers) and its test `frontend/src/lib/api/services.test.ts` (only to test them), `frontend/src/test/fixtures.ts` (only if a helper is missing) and, in `frontend/src/App.test.tsx`, only if a test there counts the dashboard's row buttons. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `frontend/src/styles/components.css`, `frontend/src/components/ui/**`, `backend/**`, or `docs/**` (except your own plan file, `docs/tasks/dashboard-pause-resume.plan.md`). Do not change `features/service-form/**`, `features/alert-list/**` or `features/sign-in/**`.

Shared files this task touches, and who owns each: everything under `features/service-list/` is owned by this task while it runs. `lib/api/services.ts` and `test/fixtures.ts` are also touched by the form tasks only if they add a wrapper or helper; this task adds two functions, so a conflict is limited to neighbouring lines and the user resolves it when merging. Tasks that may run at the same time: any backend task (none touches `frontend/`) and the service-form tasks (they change `features/service-form/**`). The edit-screen task, which adds the name link to `ServiceRow`, waits for the form tasks and runs after this one.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `pauseService` | `POST /api/services/{serviceId}/pause` | 200 (the paused `Service`); 401 `unauthenticated` (the app shell ends the session); 403 `csrf_failed`; 404 `not_found`; 500 `internal_error`; and any other failure, including a network error, as a generic failure. Not real on the server until `pause-resume-api` merges |
| `resumeService` | `POST /api/services/{serviceId}/resume` | The same set, with the resumed `Service` on 200. Not real on the server until `pause-resume-api` merges |
| `listServices` | `GET /api/services` | Unchanged. `Service.paused`, `Service.id` and `Service.name` are what this task reads |

Neither request carries a body or a query; `X-CSRF-Token` is added by `apiRequest` for a `POST`. Pausing a paused service and resuming a service that is not paused succeed with 200 and change nothing, so the screen needs no state for them. The contract lists no 409, 429 or other status for these operations.

## Behavior

### What exists

The row has the status badge, name, type chip, reason, last check, last change, the Alerts and Public flags, and the actions Alerts (a link) and Delete (a button), each with the visible label hidden from assistive technology at the desktop width. A paused row shows `Paused` instead of its status and no reason, and the Public flag reads `Paused, hidden from public page` (FR-77). The delete flow removes a row from the cached list with `removeFromList`, which keeps the time of the last real load, and shows toasts.

### The button

A button before the Alerts link, in `.svc__actions`: `btn btn--ghost btn--icon`, with the Lucide icon `Pause` and the visible label `Pause` when the service is not paused, the icon `Play` and the visible label `Resume` when it is (`service.paused`). The visible label is hidden from assistive technology like the other actions' (`.btn__label` with `aria-hidden="true"`). The accessible name is `Pause {name}` or `Resume {name}` (`aria-label`), the name as text (NFR-7). The Tab order in a row is therefore the button, Alerts, Delete. The same button element stays in place when the label changes, so it keeps focus (NFR-4).

### The click

One click sends `pauseService(id)` for a row that is not paused, or `resumeService(id)` for a paused one, with the service's `id` as it is in the list (the wrapper encodes it in the path). There is no dialog. While that row's request is in flight the button has `aria-disabled="true"` and a click or key press does nothing (it is not `disabled`, so focus stays), and a second click sends nothing. Other rows' buttons stay usable. The button's state is for that row only.

### The answer

- **200:** the row of that service in the cached list (`servicesQueryKey`) is replaced by the `Service` the server sent, keeping the list's order and the time of the last real load, after any list request in flight is cancelled, so an older refresh cannot put the old row back. The row then shows Paused (after a pause) or its stored status (after a resume), with its times and reason as sent. If the service is no longer in the cached list, the list is not changed. A success toast follows: `“{name}” paused. Checks and alerts stopped.` after a pause and `“{name}” resumed. Checking now.` after a resume, the quotes U+201C and U+201D, `{name}` the service's name from the answer, `kind: 'success'`.
- **404 `not_found`:** the service is gone. The row is removed from the cached list the same way a deleted one is, and the error toast is `That service was already deleted.` (the board: "404: the row is removed and the toast says it was already deleted").
- **403 `csrf_failed`:** the error toast `The request wasn’t accepted. Reload and try again.` with the action `Reload` (`window.location.reload()`). The row keeps its state.
- **401 `unauthenticated`:** no toast; the app shell ends the session as for every request.
- **Anything else** (a 500, a network error, an unreadable answer): the error toast `Couldn’t pause the service. Try again.` for a pause and `Couldn’t resume the service. Try again.` for a resume. The row keeps its state.

An error toast stays until dismissed and a success toast times out, as the toast component already does. Every status is told by code, never by message text.

### Decisions

- **The row changes when the server answers** (no optimistic update). The board says "the row switches to Paused at once"; at once is read as on the answer, because the board also says a failed action keeps the row's last known state, and a pause the server refused must not show as paused. While the request is in flight the button only stops accepting clicks.
- **The Resume success toast, the two generic failure toasts and the `aria-disabled` lock** are not on the board; the user chose the toast and failure wording when this task was drafted: `“{name}” resumed. Checking now.`, `Couldn’t pause the service. Try again.`, `Couldn’t resume the service. Try again.`
- **Pause and Resume stay a button with a visible label that is hidden from assistive technology,** like the other actions, with the name in `aria-label`.
- **The cache logic is shared with the delete flow:** removing a service from the cached list and replacing one are two small functions in one place (see "Structure"), instead of a second copy of what `useDeleteService` does today.

### Known gaps

- **No indication in the row while the request is in flight,** other than the button ignoring clicks; the board draws none.
- **A resume shows the row as it was stored** (healthy, unhealthy or not yet checked); the result of the immediate check shows at the next automatic refresh (FR-95) or on Refresh.
- **A list refresh in flight when an answer arrives is cancelled and not restarted** (the same as the delete flow); the next automatic refresh (FR-95) or Refresh brings the list up to date.
- **Leaving the dashboard while a request is in flight:** the request is not cancelled; its cache change applies and its toast shows wherever the admin is.
- **`SERVICES_KEY` in `useServiceList.ts` still duplicates `servicesQueryKey`** (a backlog line); the new cache module uses `servicesQueryKey`, and both have the value `['services']`.
- **No Edit button or name link yet,** so the Tab order is Pause or Resume, Alerts, Delete until the edit-screen task.
- **A real server is not available until `pause-resume-api` merges;** the tests use mocks.

## Structure

By `ARCHITECTURE.md` and `CONVENTIONS.md`. Names marked "new" do not exist yet and are fixed by this file; others are the builder's choice. One hook per concern, each with a colocated test written in the same step.

- `lib/api/services.ts` (and its test in `lib/api/services.test.ts`): `pauseService(id)` and `resumeService(id)`, each `Promise<Service>`, `POST` to `/api/services/{id}/pause` and `/resume` with the id encoded as `deleteService` does.
- `features/service-list/lib/servicesCache.ts` (new, with a test): two functions over a query client, used by both hooks: one that removes a service by id from the cached list, and one that replaces a service by id with the given one. Both cancel the list's requests in flight first, change nothing when the list is not cached, and keep the time of the last real load (`dataUpdatedAt`), as `removeFromList` does today. `useDeleteService` is changed to call the first one; its behavior and tests do not change.
- `features/service-list/hooks/usePauseService.ts` (new, with a test): `toggle(service)` sends the pause or the resume by `service.paused`; reports whether an id has a request in flight (`isPending(id)`); turns each answer into the cache change and the toast above, by status and code. It returns what `ServiceList` needs, as `useDeleteService` does (its type is exported, like `DeleteServiceFlow`).
- `features/service-list/components/ServiceRow.tsx`: the button; props gain the toggle and whether this row's request is in flight.
- `features/service-list/components/ServiceList.tsx` and `pages/DashboardPage.tsx`: pass the new hook's result to the rows (the page composes `useServiceList()`, `useDeleteService()` and `usePauseService()`).
- `features/service-list/service-list.css`: only what the new button needs that the existing action rules lack, with values from `docs/design/dashboard.css`; none is expected, since `.svc__actions .btn` already covers an icon button.

## Design reference

Reference only, read-only: `docs/design/dashboard.html` ("Pause or resume": the row with Resume and the toast `“Marketing site” paused. Checks and alerts stopped.`; "Action failed": the `csrf_failed` toast with Reload) with `docs/design/dashboard.css` and `components.css`; `docs/design/README.md` (pause and resume are `pauseService` and `resumeService`, not `updateService`). Copy values and rules from the styles; never copy board markup or component code. Icons from Lucide only. Texts copied from the board as written: `Pause`, `Resume`, the pause toast, `The request wasn’t accepted. Reload and try again.` and `Reload`.

## Dependencies

None. `lucide-react` and `@tanstack/react-query` are installed; `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Mock `lib/api/services` in the pass-through form `ServiceList.test.tsx` already uses, with `pauseService` and `resumeService` given an answer by the tests that reach them; render the composition of `DashboardPage` (the real hooks) inside a `ToastProvider` and a query client; read toasts from the page by text; use `fireEvent` as that file does, except for the focus and Tab-order checks, which use `user-event` (`fireEvent.click` does not focus a button, and `userEvent.tab` follows the real order). The test file's own `Page` composition is the one to extend with `usePauseService()`. Use the `makeService`, `makePaused` and `makeTcp` fixtures and `ApiError` for failures.

**`lib/api/services.ts`**

- `pauseService('abc')` sends `POST /api/services/abc/pause` and `resumeService('x/y')` sends `POST /api/services/x%2Fy/resume`, both with no body, and each resolves with the `Service` of the answer.

**`features/service-list/lib/servicesCache.ts`**

- Replacing a service puts the given one at the same position and leaves the others as they are; the time of the last real load is unchanged; an id that is not in the list leaves the list as it is; with no cached list nothing is created. Removing a service takes it out and keeps the order and the load time. Each cancels a list request in flight first (an older response arriving afterwards does not bring the old row back).

**`usePauseService`**

- `toggle` of an unpaused service calls `pauseService` with its id, of a paused one `resumeService`; while that id's request is in flight a second `toggle` sends nothing and `isPending(id)` is true, another id is not blocked; after the answer it is false again.
- A 200 replaces the cached row with the answer and shows the success toast of the right action with the name from the answer (`“x” paused. Checks and alerts stopped.`, `“x” resumed. Checking now.`).
- A 404 `not_found` removes the row and shows `That service was already deleted.`; a 403 `csrf_failed` shows `The request wasn’t accepted. Reload and try again.` with a `Reload` action that calls `window.location.reload` once; a 401 shows no toast; a 500 and a network error show `Couldn’t pause the service. Try again.` or `Couldn’t resume the service. Try again.` by the action; after each failure other than the 404 the cached row is unchanged.

**The dashboard (`ServiceList.test.tsx`)**

- Every row has a button named `Pause {name}` when not paused and `Resume {name}` when paused, with the visible label `Pause` or `Resume` hidden from assistive technology (a paused and a TCP row too); in each row the Tab order is that button, then the Alerts link, then Delete (FR-75, NFR-4).
- Pause: clicking `Pause Billing` sends one `pauseService` with that id and no dialog opens; while pending the button has `aria-disabled="true"`, a second click and Enter send nothing, and another row's button works; on the 200 the row shows `Paused` instead of its status, no reason and the flag `Paused, hidden from public page`, its Last check and Last change show the answer's times, the button is now `Resume Billing`, the pause toast shows, and the button has focus (FR-75, FR-77, FR-78).
- Resume: the same for a paused row: `resumeService` is sent, the row shows the stored status and reason of the answer, the button is `Pause {name}` again, the toast `“{name}” resumed. Checking now.` shows, and the button has focus (FR-79).
- A name with markup (`<b>x</b>`) shows as text in the button's name and in both toasts (NFR-7).
- Failures: after a 403 the toast has Reload and the row is as before with the button usable again; after a 500 the row is as before and the failure toast of the action shows; after a 404 the row is gone, the heading line count is one less and `That service was already deleted.` shows; after the last row's 404 the Empty block shows.
- A list refresh that arrives while a pause is in flight does not put the old row back when the pause is answered.
- Replaced on purpose, all in `ServiceList.test.tsx`: (1) "has one Delete button per row, no other row button, no switch, Open link or name link…" allows the Pause or Resume button and still fails on an `Edit` button, a switch, an `Open` link and a name link; the buttons per row become `Pause {name}` or `Resume {name}` followed by `Delete {name}`; the row's links are unchanged. (2) The mock of `lib/api/services` gains `pauseService` and `resumeService`. Any test in `App.test.tsx` that counts a row's buttons follows the same rule. Nothing else is loosened.
- The existing delete tests, unchanged, still pass with the refactored `useDeleteService` (the same toasts, the same cache result).

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

## Verifier checks

- **By reading `usePauseService.ts`, `servicesCache.ts` and `ServiceRow.tsx`:** the row changes only from the server's answer (no optimistic write); the cache change cancels the list request first and keeps `dataUpdatedAt`; outcomes are told by status and code, never by message text; `useDeleteService` uses the shared remove function and keeps its behavior; the lock is `aria-disabled`, not `disabled`; the button element is the same for both states, with its `aria-label` and label by `service.paused`; the service name is only ever rendered as text.
- **By reading the components:** no import from `features/service-form`, `features/alert-list` or `features/sign-in`; icons from Lucide only; every string defined once; no literal colour or pixel value where a token exists.
- **Keyboard, by reading:** the Tab order in a row is the button, Alerts, Delete; the button is a real `button` operable by Enter and Space; focus is not moved by the state change.
- **Contract:** both calls are `POST` with the path above; the statuses handled are those the contract lists; nothing else is assumed (the 200 body is a `Service`).
- **Mutation checks to run:** change the row before the answer; skip the list-request cancellation; drop `dataUpdatedAt`; replace the row at the end of the list; send `resumeService` for an unpaused row (swap them); show the pause toast after a resume; make the lock `disabled` (focus is lost); leave the lock on after a failure; remove the row on a 500; keep the row on a 404; drop the Reload action; make the button's name not include the service name; show the name as HTML; make a 401 show a toast. Each must fail at least one named test.
- **Inputs to try:** pause and resume of the first, middle and last row; two rows paused at the same time; a pause answered after a refresh; a 404 on the only row; a name with markup, a quote and 100 characters; a double click; Enter and Space on the button.
- **What the verifier cannot prove:** the look at 360 px (the label shows beside the icon there) and the behavior against a real server; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design board or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a new shared component, an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- `delete-service-dialog` is not merged, or a name this file takes from it is missing.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
