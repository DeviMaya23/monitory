# Task: target delivery notice

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

On a service's alert list, a target whose last delivery failed shows the board's warning under its address: "Last delivery failed. Shown until a later delivery succeeds." A target whose last delivery did not fail shows nothing. The notice goes away when the list the screen shows says the flag is false. The server sets the flag in later backend tasks (`delivery-outcome`); this task only draws it, from `Target.last_delivery_failed`, which the contract already carries.

Requirements covered:

- FR-86, the display on the alert list: a target with `last_delivery_failed: true` shows the notice; one with `false` does not; the notice is gone once a reloaded list or a saved edit returns `false`. (The dashboard half, the "Alert delivery failed" link on the service row, exists. Writing and clearing the flag is the backend's `delivery-outcome`.)
- NFR-7: the notice is fixed text; no server text is part of it.

Out of scope:

- The dashboard's "Alert delivery failed – view alert list" link (`features/service-list/ServiceRow.tsx`): built; leave it alone.
- Setting or clearing the flag on the server, retries, and the webhook sender: the backend tasks `webhook-sender`, `delivery-retry` and `delivery-outcome`. Until `delivery-outcome` merges the server always answers `false`, so the notice does not show in the running app; the tests use fixtures.
- The "Send test alert" row in the target dialog (FR-107, FR-108): the later `target-test-row`, which changes `TargetDialog.tsx`. This task does not touch the dialog.
- Any way for the admin to clear the notice, a "retry now" action, or the time or reason of the failure: the contract has only the boolean, and the board draws only the sentence.
- Promoting any alert-list copy (discard dialog, summary, banners, header rows) to a shared place: by the user's decision the feature keeps its own copies (backlog).
- End-to-end tests. The milestone's last task writes them.

## Prerequisite

Merged on the default branch. The builder checks first and stops to ask if any is missing; it creates none of them:

- `alert-list-screen` and `target-form-dialog`: `features/alert-list/components/TargetRow.tsx`, `AlertList.tsx`, `AlertList.test.tsx`, `hooks/useTargetList.ts`, `hooks/useSaveTarget.ts`, `alert-list.css`.
- The generated `Target` in `frontend/src/lib/api/schema.d.ts` has `last_delivery_failed: boolean` on both the email and the webhook shape (it does, from `TargetServerFields`).
- `.notice` and `.notice--warn` in `frontend/src/styles/components.css` (they exist; the webhook dialog's `http://` warning uses them).
- The target fixtures `makeEmailTarget` and `makeWebhookTarget` in `frontend/src/test/fixtures.ts`, which default `last_delivery_failed` to `false` and accept it as an override.

This task does not depend on any backend task.

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/alert-list/**` and, only if a helper is missing, `frontend/src/test/fixtures.ts`. You may not change `features/alert-list/components/TargetDialog.tsx` (or its test, banners, discard dialog or header rows), `features/service-list/**`, `features/service-form/**`, `frontend/src/components/**`, `frontend/src/styles/**`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `backend/**`, `docs/**` (except your own plan file, `docs/tasks/target-delivery-notice.plan.md`), or anything outside `frontend/src/`.

Shared files this task touches:

- `features/alert-list/components/TargetRow.tsx`, `TargetRow` test (new) and `AlertList.test.tsx`: owned by this task while it runs.
- `features/alert-list/alert-list.css`: only if the 360 px check below shows a missing rule (none is expected).
- `frontend/src/test/fixtures.ts`: not expected to change; both fixtures already take `last_delivery_failed`. The task `service-form-alerts` may also add a helper there at the same time. If you add one, give it a new name, add it without moving or rewording any existing helper, and do not reformat the file, so the two additions merge cleanly.

Tasks that may run at the same time: `service-form-alerts` (frontend, `features/service-form/**`, `components/ui/Switch.tsx`) and the backend chain (`webhook-sender`, `delivery-retry`, `delivery-outcome`, `test-target`, all `backend/**`). None touches `features/alert-list/**`. The later `target-test-row` changes `TargetDialog.tsx` only and waits for `test-target`; it does not share a file with this task.

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written. This task adds no request and no status or error code.

| Operation | Method and path | What this task reads |
|---|---|---|
| `listTargets` | `GET /api/services/{serviceId}/targets` | `Target.last_delivery_failed` (required boolean, `readOnly`) on each item. Already used by the screen |
| `createTarget`, `updateTarget` | `POST` and `PUT /api/services/{serviceId}/targets[/{targetId}]` | The `Target` they return carries `last_delivery_failed`; the screen already puts it into the cached list. `updateTarget` does not clear a `true` flag on the server (FR-86): the row shows what the response says |

## Behavior

### What exists

`TargetRow` renders `li.target` with the type square, `div.target__main` (the title line with the name and chip, then `span.target__addr`) and the actions or the removal confirmation. It does not read `last_delivery_failed`. The list lives in the cache under `targetsQueryKey(serviceId)`; the rows come from it in server order. A reload (`Try again` after a failed reload, and the refresh after a dialog's `Close and refresh` or a 404) and a saved edit replace the cached target objects.

### The notice

- Shown when `target.last_delivery_failed === true`, for both target types, with or without a name, and in every state of the row: its normal buttons, the removal question (the board draws it there too) and a removal in flight.
- Not shown when it is `false`. There is no loading, unknown or "ok" state; the field is required.
- Markup, as the board draws it: inside `div.target__main`, after `span.target__addr`, one `p.notice.notice--warn` containing a Lucide `TriangleAlert` (`className="icon icon--sm"`, `aria-hidden="true"`) and a `span` with the text below. The `p` has no `role` and is not a live region: it is part of the row's content, and a list that loads or refreshes with it must not be announced as an alert.
- Text, exactly (one sentence, a full stop, a second sentence, a full stop): `Last delivery failed. Shown until a later delivery succeeds.` Defined once as a constant in `TargetRow.tsx` and used from there.
- The notice never changes the row's other parts: the name, the chip, the address, the `Edit` and `Remove` buttons and their `aria-label`s are as before. It adds no button and no link.
- It follows the data. A row re-renders from the cached target, so when the cached list is replaced by one with `false` for that target (a reload, or a saved edit whose response says `false`) the notice is gone, and when a reload says `true` for a target that showed none it appears. Nothing in the component stores the flag.

### 360 px

The board draws the same markup at 360 px: the notice sits inside the main part, under the address, in the second grid column; the actions and the removal question stack beneath the main part as they already do (`@container app (max-width: 640px)` in `alert-list.css`). `.notice` is `inline-flex` with a wrapping text span and the row's main part is a flex column, so the sentence wraps on spaces and the icon stays at the top-left of its first line. No new CSS is expected; the builder checks this by reading `alert-list.css` and `components.css` against `docs/design/alerts.css` and `alerts.html` (the failed rows in the 360 px frames) and adds a rule to `alert-list.css` only if the board has one the project lacks, copying values and never board markup.

### Known gaps

- Until `delivery-outcome` merges, the running app never shows the notice (the server always answers `false`). The tests prove it with fixtures; the end-to-end journeys for failed delivery are the milestone's last task.
- The notice does not refresh by itself: the list has no polling (`useTargetList`: one query, no interval), so a flag that changes while the page is open shows after a reload or the next visit. This is the existing design of the screen (FR-17), not changed here.
- A notice on the dashboard row and on the alert list can disagree for a moment (the dashboard polls, the list does not). Not solved here.

## Structure

- `features/alert-list/components/TargetRow.tsx`: reads `target.last_delivery_failed`; the sentence is a module-level constant; the notice is part of the row, not a new component or file (it is one `p`, used once). `TriangleAlert` is imported from `lucide-react` as `TargetDialog.tsx` already does.
- No new hook, no change to `useTargetList`, `useSaveTarget` or `useRemoveTarget`: they already carry the field.
- No change to `lib/api/targets.ts`.
- New test file `features/alert-list/components/TargetRow.test.tsx` (there is none today); new cases in `AlertList.test.tsx`.

## Design reference

Reference only, read-only: `docs/design/alerts.html` (state List, the failed rows in the desktop and 360 px frames, and the removal question on a failed row), `docs/design/alerts.css` and `docs/design/components.css` (`.notice`, `.notice--warn`). Copy values and rules into the project's CSS only where it lacks one; never copy board markup or component code. Icons from Lucide only. Where the board and the contract disagree the contract wins; they do not disagree here (`docs/design/README.md` lists no difference for this notice).

Text copied from the board as written: `Last delivery failed. Shown until a later delivery succeeds.` Nothing else in this task is user-visible text.

## Dependencies

None. `lucide-react` 1.73.0 is installed and has `TriangleAlert` (the dialog and `ServiceRow` already use it). `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Targets come from the fixtures with `{ last_delivery_failed: true }` as an override. Mock `listTargets`, `deleteTarget` and, for the edit case, `updateTarget` at the wrapper boundary with value-return spies, with the pass-through mock of `lib/api/targets` that keeps `targetsQueryKey`. `AlertList.test.tsx` mocks only `listTargets` and `deleteTarget` today: add `updateTarget: vi.fn()` to its factory. Its dialog helpers are local to `TargetDialog.test.tsx`, which you may not change: write what you need in `AlertList.test.tsx`. A request that answers late is a promise the test resolves; a rejection that stands for a problem response uses the `problem(status, code)` fixture. Tests with fake timers use `fireEvent`; the others use `user-event`.

**`TargetRow` (`components/TargetRow.test.tsx`, new, rendered inside an `ul`)**

- An email target and a webhook target with `last_delivery_failed: true` each render exactly one `.notice--warn` whose text is `Last delivery failed. Shown until a later delivery succeeds.`, with an `aria-hidden` icon, and it follows the `.target__addr` element inside `.target__main` in document order (FR-86).
- The same two targets with `false` render no `.notice` at all and no text containing `delivery` (FR-86). The two cases together fail if the condition is removed or inverted.
- A target with `true` and no name still shows `Unnamed webhook` or `Unnamed email`, its chip and its address, and the `Edit` and `Remove` buttons keep their names (`Edit {label}`, `Remove {label}`): the notice changes nothing else.
- With the removal question open (`asking`), and with a removal in flight (`asking` and `removing`), a `true` target still shows the notice and a `false` target none.
- The notice is not a live region and has no role: no `role="alert"`, `role="status"` or `aria-live` on it or on an ancestor within the row (so a loading list is not announced).
- A flagged target whose name is `<b>x</b>` shows the notice with the same fixed text, and no `b` element exists in the row (NFR-7: nothing from the server enters the notice).

**The screen (`components/AlertList.test.tsx`, rendering `AlertListPage` at `/services/s1/alerts`)**

- A list of three where only the middle target has `true`: exactly one notice is on the page and it is inside the middle row; the others have none; the rows are in server order; the sub line is unchanged (FR-86, FR-17).
- A list where none has `true`: no notice anywhere. A list where all three have `true`: three notices.
- How a reload is made to fail with rows on screen (nothing else refetches the list): confirm a removal that answers `404 not_found` (`problem(404, 'not_found')`); the screen drops that row and refetches once; queue that refetch to reject with `problem(500, 'internal_error')` (or a `TypeError`). The remaining rows stay under the `Something went wrong.` banner.
- Disappears: a list of two targets, both `true`; remove the first as above, the refetch fails; the second keeps its notice under the banner. `Try again` answers with the second at `false`: its notice is gone, the row is still there, the banner is gone (FR-86).
- Appears: a list of two targets, both `false`; remove the second as above, the refetch fails; `Try again` answers with the first at `true`: the notice appears in that row.
- Edit through the dialog on a flagged row: open `Edit`, press the dialog's primary button with the form unchanged (an unchanged save is allowed, as `TargetDialog.test.tsx` shows), with `updateTarget` answering the target with `true`: the notice stays in that row; in a second test answering with `false`: it is gone; neither changes the other rows. (This proves the row follows the cached target that the save writes; the dialog itself is not changed.)
- Removing a flagged target (the request answers 204, so no refetch): the row and its notice are gone and no other row gains one.
- Opening the removal question on a flagged row keeps its notice; `Cancel` keeps it too.
- The dashboard is unchanged: `ServiceRow` and `ServiceList` tests are not edited and still pass.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

Tests this task changes on purpose: none, except the `vi.mock` factory of `AlertList.test.tsx`, which gains `updateTarget`; no existing case is edited. If an existing test fails because of the new markup, do not edit it to pass: report it.

## Verifier checks

- **By reading `TargetRow.tsx`:** the notice is rendered from `target.last_delivery_failed` only, strictly as a boolean; no `useState` or `useEffect` copies the flag; no new prop on `TargetRow` and no change in `AlertList.tsx` for it; the text is one constant, with no server text inside; there is no `role`, `aria-live`, link or button on the notice; the icon is Lucide `TriangleAlert`, `aria-hidden`; no `dangerouslySetInnerHTML`.
- **Untouched files:** `TargetDialog.tsx` and its test, `features/service-list/**`, `components/ui/**`, `styles/**` and the hooks are not in the diff (the `git diff --stat` shows only `TargetRow.tsx`, the two test files and at most `alert-list.css` and `test/fixtures.ts`).
- **By reading the CSS (jsdom cannot prove layout):** at 360 px the notice is in the main part, under the address, and wraps; the actions and the removal question stay stacked under it; no literal colour or pixel value where a token exists, other than values copied from `docs/design/alerts.css`; if `alert-list.css` changed, the added rule is on the board.
- **Wording:** the sentence matches the board character for character (two full stops, no ellipsis, no dash).
- **A criterion's test discriminates:** remove the condition so the notice always shows (the `false` cases fail); show it never (the `true` cases fail); read from the wrong field or keep the flag in state (the reload and edit cases fail).
- **Fixtures:** if `test/fixtures.ts` changed, an existing helper keeps its name, signature and output, and the diff is limited to an added helper.
- **Inputs to try:** a target with `true` and a 50-character name with no spaces and a 2,048-character URL (nothing overflows by reading the CSS); five flagged targets; a name of spaces only; an edit answered with a flag different from the list's; a reload answered while another row's removal question is open (the question stays, the notice follows the data).

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the board or this file conflict with each other, or the board's wording differs from the sentence above.
- You think you need a change outside your paths, a dependency, an edit to `TargetDialog.tsx`, a new shared component, or a state that is neither drawn on the board nor listed here.
- `Target.last_delivery_failed` is missing from the generated types.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (FR-86 display, NFR-7, with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
