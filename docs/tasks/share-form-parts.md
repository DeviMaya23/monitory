# Task: share the form parts

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

A clean-up with no change of behavior or wording: pieces that the service form, the alert list's target dialog and the shell each spell on their own move to shared places, once each, so that a change to one reaches every user. The pieces are: the field error text, the discard question, the `422` error summary, the "request not accepted" and "something went wrong" banners, the "request not accepted" toast and its words, the load-failed banner, and the focus rule of add and remove rows. The user approved these shared places (and the new files named under "Structure") by approving this task.

Requirements covered: none. FR-12, FR-74, FR-92, NFR-4 and NFR-8 keep the proofs they have. The criteria show that each piece lives once, and that every existing test of the moved pieces passes with no change to what it asserts.

Out of scope:

- **The two server-error hooks** (`useServerErrors` in `service-form`, `useTargetServerErrors` in `alert-list`): their path models differ (rows and lists against the target's fields); they stay apart.
- **The banners that differ:** the service form's `limit`, `too-large`, `not-found` banners and the target dialog's `full`, `not-found` ones, the alerts-off banner, the `Alerts are off` and dashboard banners. They are not duplicated.
- **The two `toOutcome` functions** (`features/service-list/lib/rowActionToasts.ts` and `useRemoveTarget.ts`): their outcome names differ (`gone` and `already-removed`); left for a later task (backlog).
- **Any wording change.** Every text keeps its exact characters, including the two different spellings of the "request not accepted" text (the toast's `…Reload and try again.` and the banner's `…Reload the page and try again.`).
- **Any change to the server, the contract or the design files.**

## Prerequisite

`dashboard-public-switch`, `service-public-toggle` and `service-test-panel` are merged (they change `features/service-form/`, `features/service-list/lib/rowActionToasts.ts`, `components/ui/Switch.tsx`, and the test panel adds another copy of the "request not accepted" text). The builder checks first that these exist on the default branch, and stops to ask if any is missing or named differently (it never creates them). Names come from those task files where they were not merged when this was written.

- Today's copies, which this task finds by reading the code and lists in its plan:
  - Field error text: `features/service-form/components/FieldErrorText.tsx`, `features/alert-list/components/FieldErrorText.tsx`, and `ErrorText` inside `components/NameValueRows.tsx`.
  - Discard question: `features/service-form/components/DiscardDialog.tsx` and `features/alert-list/components/TargetDiscardDialog.tsx` (they differ only in one sentence: `The changes to this service will be lost.` and `The changes to this target will be lost.`).
  - Error summary: `features/service-form/components/ErrorSummary.tsx` and `TargetErrorSummary` in `features/alert-list/components/TargetDialogBanners.tsx`, with the two `summaryTitle` functions (`features/service-form/lib/fieldLabels.ts` and `features/alert-list/lib/targetFields.ts`).
  - Banners: the `csrf` and `unexpected` cases in `features/service-form/components/FormBanners.tsx` and in `TargetDialogBanners.tsx`; the load-failed warning banner in `features/service-form/components/EditLoadStates.tsx` and in `features/alert-list/components/AlertListBanners.tsx`; the test panel's "request not accepted" notice text.
  - The "request not accepted" toast: `CSRF_MESSAGE` and `csrfToast` in `features/service-list/lib/rowActionToasts.ts`, the literal in `features/alert-list/hooks/useRemoveTarget.ts` and in `app-shell/SessionProvider.tsx`.
  - The row-focus rule: `features/service-form/hooks/useRowFocus.ts` and the effect inside `components/NameValueRows.tsx`.
- `components/ui/Dialog.tsx`, `components/ui/Toast.tsx` and `useToast`, `lib/api/ApiError.ts`.

If a copy is not what is written here (a text differs, a prop differs), the builder does not unify it silently: it keeps the copies apart, says which, and reports it.

`package.json` and the lockfile do not change.

## Role and ownership

Role: Frontend.

You may change `frontend/src/components/` (the new files and `NameValueRows.tsx` with its test), `frontend/src/hooks/` and `frontend/src/lib/` (the new files named under "Structure"), `frontend/src/features/service-form/**`, `frontend/src/features/alert-list/**`, `frontend/src/features/service-list/lib/rowActionToasts.ts` and `rowActionToasts.test.ts` and the importers of what moves from it (`features/service-list/hooks/`), `frontend/src/app-shell/SessionProvider.tsx` (only the toast text) and `frontend/src/app-shell/SessionProvider.test.tsx` (only the one new case named under "Acceptance criteria"). You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `frontend/src/styles/`, `frontend/src/components/ui/**`, `frontend/src/lib/api/**`, `frontend/src/App.tsx`, `frontend/src/main.tsx`, the rest of `features/service-list/`, `features/sign-in/**`, `features/public-dashboard/**`, `backend/**`, `e2e/**`, or `docs/**` (except your own plan file, `docs/tasks/share-form-parts.plan.md`).

Shared files this task touches, all owned by this task while it runs: the files above. No other frontend task runs at the same time (the three it waits for are prerequisites); any backend task may.

## Operations used

None. No request changes.

## Behavior

### What exists

See "Prerequisite". Every piece listed is spelled once per place; each place's tests assert its own copy.

### What changes

Nothing a user can see: every rendered element, class name, text, `role`, `aria` attribute, id, focus move and toast stays as it is (the existing tests of every moved piece pass with only their import paths and, where a component moved, their file location changed). Each piece moves as follows.

1. **Field error text.** One component in `components/` (the icon and the message as text, `p.error-text` with the given id). The service form, the alert list and `NameValueRows` use it; the three copies go.
2. **Discard question.** One component in `components/` over the `Dialog` wrapper, with the same title, the same buttons and focus rules (`Keep editing` focused first; Esc and the backdrop do what it does), taking the body sentence as a prop (the service form passes `The changes to this service will be lost.`, the target dialog `The changes to this target will be lost.`). The two copies go.
3. **Error summary.** One component in `components/` showing the title from one `summaryTitle(count)` and the list of entries, each a link to an input id or plain text. Its entries have a type of the component's own, `{ key, label, message, inputId }` (`inputId` null for plain text; a feature's hook entry type is never imported by it), and it reports a click with the input id. The service form's hook keeps its `target`-based entries and the form maps them to an `inputId` (`fieldId(target)`) where it renders the summary, and passes a handler that takes an id and focuses that element (a one-line function or a small helper in the feature; the builder's choice, listed in the plan); the target dialog passes its entries as they are. The wording of the title (`{n} fields need fixing before this can be saved.`, `1 field needs fixing before this can be saved.`) lives once in `lib/`; both old `summaryTitle` functions go (and their tests move).
4. **Failure banners.** In `components/FailureBanners.tsx`, three exports in all (this item's two and the load-failed banner of item 5): the `csrf` banner (title, text, `Reload` button with the `RefreshCw` icon, `role="alert"`) and the `unexpected` banner (the `WifiOff` icon, `Something went wrong.`, `The server couldn’t be reached or returned an error. Your values are still here.`, a `Try again` button with `RefreshCw` that calls the given handler). The service form's and the target dialog's banners render them in place of their copies; their other cases stay theirs. The test panel's "request not accepted" notice (found by its text in `features/service-form/components/`; it has its own markup, `p.notice.notice--bad` in `div.test-result`, so it does not use the banner component) takes its words from the same constants: its text is the module's title, a space, and the module's text (`The request wasn’t accepted. Reload the page and try again.`), and its `Reload` button label is the module's.
5. **Load-failed banner.** The third export of `FailureBanners.tsx`: the warning banner (`role="status"`, `WifiOff`, `Something went wrong.`, `The server couldn’t be reached or returned an error.`, a `Try again` button with `RefreshCw`, disabled by a prop while a request is in flight). `EditLoadStates` and `AlertListBanners` use it.
6. **The "request not accepted" words.** One module in `lib/` holds: the banner's title `The request wasn’t accepted.` and text `Reload the page and try again.`, the toast's message `The request wasn’t accepted. Reload and try again.`, the `Reload` label, and `csrfToast()` (kind `error`, the message and an action `Reload` that reloads the page), returned as a plain object typed with the toast input type imported as a type from `components/ui/useToast`, as `rowActionToasts.ts` does today. `rowActionToasts.ts` drops its `CSRF_MESSAGE` and `csrfToast` and its importers (`useDeleteService`, `usePauseService` and, from the dashboard task, the public view hook) use the shared one; `useRemoveTarget` and `SessionProvider` use `csrfToast()` instead of their literals; the csrf banner, the test panel's notice and the toast take their text from the module.
7. **Row focus.** One hook in `hooks/` (the rule of `service-form`'s `useRowFocus`: Add moves focus to the new row's first input, Remove to the next row's, else the previous row's, else the Add button), used by `NameValueRows` and by the service form's groups that use it today. The copy in `service-form/hooks/` and the effect in `NameValueRows` go; the hook's test moves with it and keeps its cases.

### Known gaps

- The two server-error hooks stay separate (see "Out of scope").
- The `toOutcome` copies stay (backlog).
- The csrf text keeps two spellings (toast and banner), as the design draws them.

## Structure

By `ARCHITECTURE.md` and `CONVENTIONS.md` ("Matching existing shapes", "No duplicated logic across entry points"). Names marked "new" are fixed by this file; the rest are the builder's choice. Each new file has a colocated test written in the same step; a test that exists for a copy moves with it (the `useRowFocus` test and the two `summaryTitle` tests, all their cases kept) and is not weakened; the tests of `FieldErrorText`, `DiscardDialog`, `ErrorSummary` and the banners are new, written from the cases of the screens that exercised the copies.

- `frontend/src/components/FieldErrorText.tsx`, `DiscardDialog.tsx`, `ErrorSummary.tsx`, `FailureBanners.tsx` (the `csrf` and `unexpected` banners and the load-failed banner as three exports) (new).
- `frontend/src/hooks/useRowFocus.ts` (new, moved, with its harness test).
- `frontend/src/lib/requestNotAccepted.ts` (new: the words and `csrfToast`) and `frontend/src/lib/summaryTitle.ts` (new), each with a test.
- Edits in: `components/NameValueRows.tsx`; `features/service-form/` (components, `lib/fieldLabels.ts`, the group that used the hook, the test panel's notice, `EditLoadStates.tsx`, `FormBanners.tsx`); `features/alert-list/` (`TargetDialog.tsx`, `TargetDialogBanners.tsx`, `AlertListBanners.tsx`, `useRemoveTarget.ts`, `lib/targetFields.ts`); `features/service-list/lib/rowActionToasts.ts` and the hooks that import from it; `app-shell/SessionProvider.tsx`.
- Deleted: the replaced copies, `service-form/hooks/useRowFocus.test.tsx` and the `summaryTitle` cases of `fieldLabels.test.ts` and `targetFields.test.ts` once they have moved.

## Design reference

None: no visual change. Reference only, read-only, where a moved piece is checked against the board: `docs/design/service-form.html`, `alerts.html`, `dashboard.html`. Nothing is copied from them.

## Dependencies

None. `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. The pieces are tested where they now live; the screens' own tests are the proof that nothing changed.

**The shared pieces (each in its own colocated test)**

- `FieldErrorText`: renders `p.error-text` with the given id, the icon `aria-hidden` and the message as text (a message `<b>x</b>` shows literally) (NFR-7).
- `DiscardDialog`: closed renders nothing; open shows `Discard unsaved changes?`, the given body sentence, `Keep editing` with focus, `Discard changes`; `Keep editing`, Esc and the backdrop call `onKeep`; `Discard changes` calls `onDiscard`; both body sentences render as given.
- `ErrorSummary`: the title for 1 and for 3 entries; an entry with an `inputId` is a link that calls the handler with it (no navigation) and one with `null` is plain text; the root is `role="alert"` with `tabindex="-1"` and forwards its ref; a message with markup shows as text.
- `summaryTitle`: all the cases of the two old tests (`1 field needs fixing before this can be saved.`, `3 fields…`, `4 fields…`).
- Banners: the `csrf` banner shows its title, text and `Reload`, and clicking it calls `window.location.reload` once (the usual spy); the `unexpected` banner shows its texts and `Try again` calls the handler; the load-failed banner shows its texts with `role="status"`, and `Try again` is disabled when the prop says so.
- `requestNotAccepted`: the three strings are as written above; `csrfToast()` is `{ kind: 'error', message, action: { label: 'Reload', onClick } }` and `onClick` reloads once.
- `useRowFocus`: all the cases of the moved test (add focuses the new row's first input; remove focuses the next, else the previous, else the Add button).

**No copy is left**

- A text search of `frontend/src`, leaving out tests and `styles/`, finds each of these strings only in its owner: `The request wasn’t accepted.` and `Reload the page and try again.` and `Reload and try again.` in `lib/requestNotAccepted.ts`; `Discard unsaved changes?` in `components/DiscardDialog.tsx`; `fields need fixing before this can be saved` in `lib/summaryTitle.ts`; the markup `className="error-text"` in `components/FieldErrorText.tsx`; and `The server couldn’t be reached or returned an error.` in `components/FailureBanners.tsx` (two hits there, the unexpected banner's longer sentence and the load-failed banner) and in the test panel's own sentence `The test couldn’t be run. The server couldn’t be reached or returned an error.` (the verifier runs the search; the builder lists the result in the plan).

**The users (existing tests, with their asserted text and behavior unchanged)**

- The service form (Add and Edit), the target dialog, the alert list, the dashboard's row actions (delete, pause, public switch), `SessionProvider` (sign-out failure), `NameValueRows` and the test panel pass every existing test; the changes allowed in those tests are import paths and the location of tests that moved with a component.
- One new case in `useRemoveTarget.test.tsx` and in `SessionProvider.test.tsx` each asserts the toast comes from `csrfToast()` (same message, `Reload` action, reload called once), so that a change to the shared module reaches both.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

Tests this task changes on purpose: import paths in the tests of the moved pieces; the tests of the deleted copies move to the shared pieces' tests (their cases kept); `rowActionToasts.test.ts` loses the cases of the moved `CSRF_MESSAGE` and `csrfToast` (they move to `requestNotAccepted.test.ts`). No assertion is removed or loosened.

## Verifier checks

- **By reading:** no copy of a moved piece remains; every user imports the shared piece; the shared pieces import nothing from a feature or from `app-shell/`; `components/` pieces take their varying text by props, not by feature-specific branches; no text changed by a character (compare each string with the string in the replaced copy by `git diff` of the old files).
- **The search in "No copy is left":** run it and report each hit.
- **Behavior:** run `make check`; every test that existed before passes unchanged except imports and locations; the diff of the existing tests shows no changed assertion.
- **Mutation checks to run:** change a word in a shared string and see a feature test fail in every place that shows it; drop the `onKeep` of Esc in the discard dialog and see both the service and the target tests fail; drop the `inputId` link and see both summaries fail; make `csrfToast` reload twice; revert one user to a literal (the new `useRemoveTarget` and `SessionProvider` cases fail); change the row-focus fallback and see `NameValueRows` and the rules' tests fail.
- **Inputs to try:** the target dialog opened inside the alert list (nested discard question); the Edit form load failure; a sign-out `403`; a delete `403` on the dashboard; a public switch `403`; a header row added and removed at each position in the form and in the target dialog.
- **What the verifier cannot prove:** the look; nothing visible changes and it is not checked in a browser.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design board or this file conflict with each other.
- A copy differs from its description in "Prerequisite" (a text, a prop, a class), or unifying two copies would change a rendered character, a role or an id.
- You think you need a change outside your paths, a dependency, a `components/ui/` change, or an edit to a spec or design file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps (one piece at a time, with its users and its moved tests), push your branch (never the default branch), and finish with a short report: branch name, what moved, the result of the text search, requirement IDs covered (none), that no integration test applies, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle.
