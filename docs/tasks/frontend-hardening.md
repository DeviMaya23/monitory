# Task: frontend hardening

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

Five small loose ends in the admin screens are closed before the milestone 5 keyboard check (NFR-4):

1. The toast sits at the bottom of the window, not of the page, on a tall page. Its order against dialogs does not change: dialogs stay above toasts.
2. The Type hint of the service form is part of the radio group's description for screen readers.
3. A save that finishes after the admin has left the form still refreshes the dashboard.
4. After a `422` on the notification target dialog, switching the type drops the summary entries of the type that is no longer shown.
5. The `Discard changes` answer is proven for a Forward move, not only for Back.

Requirements covered:

- NFR-4, in part: the Type hint is announced with the group (item 2). The rest of NFR-4 is the end-to-end keyboard journeys and the manual check.
- FR-95 (the dashboard refreshes itself): item 3 makes the list refresh after a save that finished off-screen.
- FR-74 (a rejected save names the field), in part: the `422` summary on the notification target dialog lists only fields the admin can still see (item 4).

Out of scope:

- The duplicated `toOutcome` and the two server-error hooks with different path models (`share-form-parts` left-out line). No trigger has happened; it stays in the backlog.
- Moving `SignInForm`'s focus effects into a hook (backlog, `sign-in-screen`).
- Any change to the contract, the backend, the end-to-end suite or the design boards. The end-to-end proof of items 1 and 3 is planned for `m5-e2e-journeys` (not drafted yet).
- Making a toast readable while a dialog is open. The user decided against it: a modal dialog already hides everything outside it from screen readers and keeps focus inside, so a toast above it would be visual only, and on narrow screens it would cover the dialog sheet's bottom button (an error toast stays until dismissed).
- `useService.ts` (line 37) also calls `removeQueries` for the services list when a service is not found. It runs on the form's own page, where the dashboard is not mounted, so it keeps the removal as it is.
- A new toast, dialog or banner text, or any new visible text.

## Prerequisite

All merged on the default branch (they are today). The builder checks the names and stops to ask if one is missing:

- `components/ui/Toast.tsx` (`ToastProvider`, `BaseToast.Viewport`), `components/ui/portalHost.ts` (`getPortalHost`), `.portal-host`, `.toast-viewport`, `.dialog-layer` and `.dialog-backdrop` in `frontend/src/styles/components.css`.
- `components/ui/RadioGroup.tsx` and its test, `features/service-form/components/TypeField.tsx` with `TYPE_HINT_ID` and `TYPE_TEXT.hint` in `features/service-form/lib/serviceType.ts`.
- `features/service-form/hooks/useSaveService.ts` with `servicesQueryKey`, and its test.
- `features/alert-list/components/TargetDialog.tsx`, `hooks/useTargetServerErrors.ts` and `lib/targetFields.ts` (`fieldInfo`, `isHeadersPath`), with their tests.
- The `Back and Forward` block in `frontend/src/App.test.tsx`.
- `@base-ui/react` 1.9.0 in `package.json`, whose `Toast` has a `Portal` part with a `container` prop.

## Role and ownership

Role: Frontend.

You may change `frontend/src/**`. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `backend/**`, `e2e/**`, `docs/**` (except your own plan file, `docs/tasks/frontend-hardening.plan.md`) or anything else outside `frontend/src/`.

Shared files this task touches, owned by this task while it runs: `components/ui/RadioGroup.tsx` (used by both forms), `components/ui/Toast.tsx`, `styles/components.css`, `App.test.tsx`.

Tasks that may run at the same time: `backend-hardening` (backend only) and `m5-security-journeys` (`e2e/**` only). No other frontend task runs beside this one. `m5-e2e-journeys` waits for this task.

## Operations used

None new. Items 3 and 4 use operations the screens already call (`createService`, `updateService`, `listServices`; the target dialog's `createTarget` and `updateTarget` answering `422`). No contract change, and the screens' requests and the codes they handle do not change.

## Behavior

### 1. Toasts: placed against the window, still below dialogs

Today the toast viewport (`position: fixed`, `z-index: 30`) is rendered inside `.app`, whose `container-type: inline-size` makes it the containing block of fixed descendants, so the viewport is placed against `#root`'s box, not the window: on a page taller than the window it sits at the bottom of the page. The portal host (`z-index: 40`) holds the dialogs and puts them above the viewport. The user decided: **the order stays, dialogs above toasts; only the placement is fixed.**

- The toast viewport is rendered into the portal host: `BaseToast.Portal` with `container={getPortalHost()}` around `BaseToast.Viewport` in `ToastBridge`. The host is fixed and viewport-sized, so the viewport is placed against the window. The toast list, its content, `SUCCESS_TOAST_MS`, the priorities and `useToast` do not change.
- Inside the host the order must stay: the dialog layer and backdrop (`z-index: 20`) above the toast viewport. So `.toast-viewport` gets `z-index: 5` (below the select layer at 10, the dialog layer and the backdrop at 20). Its position, spacing and the mobile rule (left and right `--space-3`, `components.css` line 601) do not change. The host's own `z-index: 40` does not change; it keeps host contents, the toast included, above the page.
- The comment above `.portal-host` is rewritten: it must say that the host holds the dialogs, selects and the toast viewport, that inside it the toast (5) is below the select layer (10) and the dialog layer (20), and why the viewport lives in the host.
- Nothing about a toast's content, timing, dismissal or focus changes.

The mobile container query (`@container app (max-width: 640px)`) now resolves against the host, which also has the class `app`; the host is viewport-sized, so the same breakpoint applies. The measurement below checks it.

How this is shown, because jsdom has no layout: the builder measures it in headless Chrome with the real CSS (a throwaway script or page outside the repository, not committed; Playwright and its browsers are installed under `e2e/`, which may be used from there without changing anything in it) and reports the numbers:

- with a toast shown, on a dashboard taller than the window and scrolled to its top, at 1120 px width: the toast viewport's bottom edge is 16 px (`--space-4`) above the window's bottom and its right edge 16 px inside the window's right;
- the same at 360 px width: bottom 12 px (`--space-3`) above, left and right 12 px inside;
- with a dialog open and a toast shown, `document.elementFromPoint` at the toast's centre does **not** return an element inside the toast (the dialog layer or backdrop is above it).

### 2. The Type hint describes the radio group

`RadioGroup` gains an optional prop (name chosen by the builder, for example `describedBy`) with the id of the element that describes the group. When given, the group element (the Base UI `RadioGroup`, the element with role `radiogroup`) carries `aria-describedby` with that id; when not given, it has no `aria-describedby`. `TypeField` passes `TYPE_HINT_ID`. The notification target dialog's radio group passes nothing (it has no hint). No visible change.

### 3. A save that finishes after the admin has left

`useSaveService` is shared by Add service and Edit service. Today, on a 200 or 201 it calls `removeQueries` for `servicesQueryKey` (exact). If the admin has gone back to the dashboard while the request was in flight, the dashboard's list query is mounted, `removeQueries` does not refetch it, and the dashboard stays stale until the next automatic refresh.

New rule, applied wherever the hook drops the list today (a successful save, and the `not-found` failure):

- if the services list query has an active observer (the library's `query.isActive()`: at least one enabled observer, as the mounted dashboard has), it is refetched with `refetchQueries` on that exact key, and the dashboard shows the new list when it answers;
- if it has none, it is removed from the cache as today, so the dashboard loads fresh when it mounts.

The refetch is started and **not awaited**, and its result never reaches the hook's `try` and `catch`: a failed refetch is the dashboard's own failure state (FR-95) and must not turn a saved service into a failed save or skip `onSaved`. The refetch is started, or the query removed, before `onSaved` runs.

Everything else in the hook is unchanged: the in-flight guard, `onSaved` running only while the form is on screen, the failure classification.

### 4. Type switch on the notification target dialog

After a `422`, the summary (`ErrorSummary`) lists one entry per server error, built by `useTargetServerErrors`. Switching the Type in the dialog calls `clearErrors(['address', 'url'])` for the form's field errors but leaves the summary entries of the type that is no longer shown (for example `Webhook URL: …` after switching to Email, linking to an input that is not in the page). The user decided: **a type switch drops the other type's entries.**

- Switching to Email removes the summary entries whose path is `url`, `headers` or starts with `headers[`. Switching to Webhook removes the entry whose path is `address`. Entries for `name` and any other path stay. Switching to the type that is already chosen changes nothing.
- The summary's title follows the count (`1 field needs fixing before this can be saved.` or `{n} fields need fixing before this can be saved.`, from `summaryTitle`); when no entry is left the summary is not shown.
- The field messages under the inputs follow the entries (`errorFor`), as they do today after an edit.
- Focus does not move: the Type radio stays focused.
- It is a semantic mutator of `useTargetServerErrors`, `clearType(next)` with the type just chosen (`'email'` or `'webhook'`), not a raw setter; the dialog calls it from the radio group's `onValueChange` beside the existing `clearErrors`. It records the dropped paths in the same per-response record as an edited field, so it applies to the current response only and a later response starts fresh.
- Switching back to the first type does not bring the dropped entries back.

### 5. Forward and Discard

In `App.test.tsx`, `Back and Forward` proves Keep editing for Back and Forward, and Discard changes only for Back. Add a case: from a changed Add service form, Forward asks; Discard changes completes the move, and the app is on the target of the Forward (the alert list).

### Known gaps

- **Items 1 and 3 are not proven end to end here.** Item 1's placement is only measured by the builder; a journey for the toast's place on a scrolled page, and one for item 3, are planned for `m5-e2e-journeys` (not drafted when this file was written).
- **A toast fired while a dialog is open is hidden behind it** until the dialog closes: a success toast may expire unseen, an error toast waits. Decided by the user (see Out of scope).
- **The toast's place in the tab order** changes: the viewport now sits at the end of `body`, after `#root`. Base UI's behavior for hotkeys and live regions is otherwise unchanged. The keyboard checks (NFR-4) look at it.
- **Item 3 does not retry a failed refetch.** A failed refetch is the dashboard's own failure state (FR-95).

## Structure

By `ARCHITECTURE.md`. No new file is required; names this file does not give are the builder's choice.

- `components/ui/Toast.tsx` and `Toast.test.tsx`: the viewport wrapped in `BaseToast.Portal` with the portal host as `container`.
- `components/ui/portalHost.ts`: its doc comment says the host holds "the dialog, alert dialog and select list"; add the toast viewport. No code change.
- `styles/components.css`: `.toast-viewport` `z-index` from 30 to 5, and the comment above `.portal-host`. No other rule changes unless the measurement shows one must (then say so in the report and keep the change minimal).
- `components/ui/RadioGroup.tsx` and `RadioGroup.test.tsx`; `features/service-form/components/TypeField.tsx`.
- `features/service-form/hooks/useSaveService.ts` and `useSaveService.test.tsx`.
- `features/alert-list/hooks/useTargetServerErrors.ts` and its test; `features/alert-list/components/TargetDialog.tsx` and its test.
- `App.test.tsx`.

## Design reference

No new screen state. The toast and the dialogs look as they do now; only their stacking and the toast's containing block change. Use the library's components: the toast stays `BaseToast`, and nothing is hand-written in place of `Portal`.

## Dependencies

None. `@base-ui/react` 1.9.0 is installed; `package.json` and the lockfile do not change.

## Acceptance criteria

Vitest with Testing Library, with the conventions of the existing tests. Every criterion is a test that fails if the behavior is removed, except the measured ones in item 1.

**Toast (`components/ui/Toast.test.tsx`)**

- The toast viewport is a descendant of the portal host (`[data-portal-host]`). (`ToastProvider` renders no element of its own, so this is the testable form.)
- A toast is shown and dismissed exactly as before: the existing Toast tests still pass with no change in what they assert.
- Any new test here that has the fake timers on fires events with `fireEvent`, not `user-event` (`TESTING.md`, "Test setup").
- Measured in headless Chrome, reported in the handback, not committed (see item 1): the four edge distances and the `elementFromPoint` check. The z-index order itself is not testable in jsdom.

**RadioGroup (`components/ui/RadioGroup.test.tsx`) and the Type field**

- With the description prop given, the `radiogroup` element has `aria-describedby` equal to that id; without it, no `aria-describedby`.
- In the service form, the `radiogroup` named `Type` has the accessible description `Changing type swaps the fields below.` (`toHaveAccessibleDescription`), on both the Add and the Edit form (one test through each form, or one through `TypeField`).
- The notification target dialog's `radiogroup` has no `aria-describedby`.

**`useSaveService` (`useSaveService.test.tsx`)**

- With an active observer on the services list query when the send resolves (the test mounts a second hook with `useQuery` on `servicesQueryKey`, which the existing `setup` does not have), the list is fetched again (the query function is called a second time) and the cached data is not removed; `onSaved` still runs once if the form is on screen.
- A refetch that fails does not change the outcome: `saved` is true, `failure` is `null` and `onSaved` ran.
- With no observer, the query is removed from the cache after a successful save, as today.
- The same for the `not-found` failure: active, refetched; inactive, removed.
- The in-flight guard, the `onScreen` rule and the failure classification keep their existing tests unchanged.

**Add service, end to end in the app (`App.test.tsx`)**

- Visit the dashboard first, so the list is cached and observed. Open Add service and start a save that has not answered yet (a promise the test resolves later), go back to the dashboard by the back link or the browser's Back (discarding the question if asked), then resolve the save: the dashboard calls `listServices` again and shows the new service. The dashboard remounts and loads on mount too, so the mock returns the old list for the calls before the save resolves and the new list for the call that follows it. Without the change it keeps the old list (the test fails).

**Target dialog (`useTargetServerErrors.test.tsx`, `TargetDialog.test.tsx`)**

- With a `422` carrying `name`, `url` and `headers[0].value` errors, switching to Email removes the `url` and `headers[0].value` entries and keeps `name`; the summary title reads `1 field needs fixing before this can be saved.`; the `Webhook URL` entry and the `Custom headers` entries are not in the page.
- With a `422` carrying `name` and `address` errors, switching to Webhook removes `address` and keeps `name`.
- With only entries of the inactive type, the whole summary disappears.
- Focus is still on the Type radio after the switch.
- Editing a field still clears its own entry (the existing tests are unchanged).

**Leave prompt (`App.test.tsx`)**

- In `Back and Forward`: from a changed Add service form, Forward asks; `Discard changes` completes the move and the page is the alert list (`/services/s1/alerts`), with no second question. A mutation that makes `Discard changes` not proceed a pending Forward fails it.

**Repo-wide**

- `make check` passes.
- Nothing outside `frontend/src/` changed; `package.json` and the lockfile are unchanged.

## Verifier checks

The verifier has no browser. Check by reading the code and the tests:

- **Portal:** the viewport is inside `BaseToast.Portal` with the portal host as `container`; nothing else about `ToastProvider` changed; `.portal-host` still `position: fixed; inset: 0; z-index: 40`; `.toast-viewport` `z-index` is below 10; the comment is rewritten to match.
- **Measurements:** the handback gives the measured numbers from headless Chrome (four edge distances and the `elementFromPoint` result). The verifier cannot run them; if they are missing, report it.
- **Library first:** no hand-written portal, no `createPortal` for the toast.
- **`aria-describedby`** is on the `radiogroup` element, not on a radio, and only when the prop is given.
- **`useSaveService`:** the active check is `query.isActive()` (or the library's equivalent for "has an enabled observer"), not a flag set by a component; the refetch is not awaited and its promise is not inside the `try`'s failure path; the refetch or removal comes before `onSaved`.
- **Target errors:** the new mutator is a function of the hook; entries are filtered by path, not by label or message text; the errors array is not copied.
- No `eslint-disable`, no new dependency, no `dangerouslySetInnerHTML`.
- **Mutation checks to run:** render the viewport outside the portal again (the descendant test must fail); drop the `aria-describedby` (the description tests must fail); always `removeQueries` (the active-observer test must fail); never remove when inactive (the inactive test must fail); filter the other type's entries the wrong way round (both type tests must fail); drop `name` along with the other type's entries (the `name` assertions must fail); make `Discard changes` a no-op for a pending Forward (the new Forward test must fail); await the refetch inside the `try` (the failed-refetch test must fail); raise `.toast-viewport` above the dialog layer (no test can catch it: the measured `elementFromPoint` result must show it).
- **Inputs to try:** a `422` that has only `headers` (the bare path) and a switch to Email; a header-row error `headers[3].name`; a `422` with an unknown path (kept); two switches in a row (Email, Webhook, Email); a save finishing while the admin is on the Edit form of another service.

## Stop and ask when

- The contract, a requirement, the design or this file conflict with each other.
- You think you need a change outside `frontend/src/`, a dependency, or an edit to a spec or design file.
- `BaseToast.Portal` cannot hold the viewport with the toast list inside it, or the measurement shows the toast is still placed against the page, not the window.
- A state appears that is neither in this file nor on the board.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), the measured numbers from item 1, that no integration tests apply, that no dependency changed, and anything you were unsure about. Also list every judgment call this file did not settle.
