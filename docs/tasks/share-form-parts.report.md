# Verification report: share the form parts

Verifier branch: `verify/share-form-parts` (reset onto the builder's `feat/share-form-parts` at `56a5a41`; this report is the only commit added).

Verdict: **no Blocking findings.** Every acceptance criterion is met. `make check` passed: 1405 frontend tests in 83 files, the Go lint and tests, and the builds. No source file was changed by the verifier.

`frontend/node_modules` was missing in the fresh checkout, so the first `make check` stopped at `eslint: command not found`. I ran `npm ci` (nothing tracked changed) and ran `make check` again; that is the run reported here.

## Criteria

"Real?" asks whether the named test fails if the behavior is removed. "M#" points to the mutation in "Mutation checks run".

| # | Criterion | Test that covers it | Real? | Status |
|---|---|---|---|---|
| 1 | `FieldErrorText`: `p.error-text`, the id, a hidden icon, the message as text, markup shown literally (NFR-7) | `components/FieldErrorText.test.tsx` (2 cases); the screens' tests through it | Yes for the id (M9b fails the component test and 64 tests in all). The `aria-hidden` check can pass without the explicit prop, because lucide adds `aria-hidden="true"` by default (M9a was an equivalent mutant). The `<b>` case fails if the message were rendered as HTML. | Met |
| 2 | `DiscardDialog`: closed renders nothing; title, body, `Keep editing` focused, `Discard changes`; Keep, Esc and backdrop call `onKeep`; Discard calls `onDiscard`; both sentences render | `components/DiscardDialog.test.tsx` (5 cases) | Yes. M2 (Esc and backdrop dropped) fails the component test, the target dialog test and the Add form test. | Met |
| 3 | `ErrorSummary`: title for 1 and 3, link calls the handler with the input id and does not navigate, `null` is plain text, `role="alert"`, `tabindex="-1"`, ref forwarded, markup shown as text | `components/ErrorSummary.test.tsx` (5 cases) | Yes. M3 (handler call dropped) fails the component test, the target dialog and 7 Add form cases. | Met |
| 4 | `summaryTitle`: the cases of the two old tests (1, 3, 4) | `lib/summaryTitle.test.ts` (3 cases) | Yes. The summary title text is pinned here and in the screens' 422 tests. | Met |
| 5 | Banners: csrf title, text and `Reload` reloading once; unexpected texts and `Try again`; load-failed `role="status"` and disabled `Try again` | `components/FailureBanners.test.tsx` (4 cases) | Yes. M1 and M10 fail the csrf case, and M8 fails the disabled case. The unexpected banner's sentence is pinned by the component test. | Met |
| 6 | `requestNotAccepted`: the three strings, `Reload`, `csrfToast()` shape, reload once | `lib/requestNotAccepted.test.ts` (2 cases) | Yes. M1, M4, M7 and M10 each fail it. | Met |
| 7 | `useRowFocus`: all cases of the moved test | `hooks/useRowFocus.test.tsx` (moved, 100% similar) | Yes. M6 fails it. | Met |
| 8 | No copy left (text search) | The search in "Rule checks" | n/a (a search, not a test) | Met |
| 9 | Users keep their existing tests: service form (Add and Edit), target dialog, alert list, dashboard row actions, `SessionProvider`, `NameValueRows`, test panel | The existing tests; the diff of existing tests changes imports and removes only moved cases | Yes. The mutations broke these tests in every place that shows the piece. | Met |
| 10 | New case in `useRemoveTarget.test.tsx` and in `SessionProvider.test.tsx`: the toast comes from `csrfToast()` | `shows the shared csrfToast…` in each | Yes for a user that stops using `csrfToast()` and words the toast differently (M5a, M5b). Partly, see N2 for an identical literal. | Met |
| 11 | `make check` passes | Run here | n/a | Met |
| 12 | Nothing outside the allowed paths changed; `package.json` and the lockfile unchanged | `git diff --name-only d5971dc HEAD` | n/a | Met |

## Plan check

I read `share-form-parts.plan.md` after the code review above.

- Every criterion has a checklist item. None is missing.
- Every ticked item has a test file that exists and checks the behavior (see "Real?").
- The plan's search result matches the one I ran. It also notes the doc-comment hit for `Discard unsaved changes?` in `useTargetLeaveGuard.ts:16`, and that hit is not rendered text.
- The plan and the diff agree. The plan's judgment calls match what the diff does: `focusById` added to `fieldIds.ts`, `focusField` calling it, `SummaryEntry` exported from `ErrorSummary.tsx`, the form mapping `target` to `inputId` inline, and `TEST_TEXT.csrf` built from the words module.
- The plan says the existing tests changed "only by import paths". That is true except for the cases the task file said move (`CSRF_MESSAGE` and `csrfToast` out of `rowActionToasts.test.ts`, and the two `summaryTitle` cases out of `fieldLabels.test.ts` and `targetFields.test.ts`). They exist in the new files.

## Rule checks

- **Dependencies:** `package.json` and the lockfile are unchanged. No new library; `lucide-react` was already used.
- **Layer boundaries (CONVENTIONS "A file in one feature never imports from another feature"):** `components/{DiscardDialog,ErrorSummary,FailureBanners,FieldErrorText}.tsx`, `hooks/useRowFocus.ts` and the two new `lib/` modules import nothing from `features/` or `app-shell/` (grep). `lib/requestNotAccepted.ts` imports only the `ToastInput` type from `components/ui/useToast`, as the task file says.
- **Varying text by props:** `DiscardDialog` takes `body`; `ErrorSummary` takes entries with its own type; the banners take handlers and `fetching`. No feature-specific branch inside the shared pieces.
- **Text unchanged by a character:** I compared each moved string with the old copy in the diff. All are identical, including the two spellings of the "request not accepted" text. `TEST_TEXT.csrf` is now `${TITLE} ${TEXT}`, which equals the old literal.
- **Out-of-scope items untouched:** the two server-error hooks, the two `toOutcome` functions, the differing banners, the server, the contract and the design files.
- **Component library (STACK.md):** `DiscardDialog` uses `components/ui/Dialog`. No hand-written version of a library component was added. The `btn` classes are the same markup as before. No design reference code was copied; `docs/design/` is not in the diff.
- **Allowed paths:** the diff touches only `frontend/src/**` inside the listed directories, plus the plan file.
- **Data scoping and transactions:** not applicable; no backend change.

### Text search ("No copy is left"), run by the verifier

The search covered `frontend/src`, leaving out tests and `styles/`.

| String | Hits |
|---|---|
| `The request wasn’t accepted.` | `lib/requestNotAccepted.ts:4` (title) and `:10` (toast, which starts with it) |
| `Reload the page and try again.` | `lib/requestNotAccepted.ts:7` |
| `Reload and try again.` | `lib/requestNotAccepted.ts:10` |
| `Discard unsaved changes?` | `components/DiscardDialog.tsx:19`, and a doc comment in `features/alert-list/hooks/useTargetLeaveGuard.ts:16` (not rendered) |
| `fields need fixing before this can be saved` | `lib/summaryTitle.ts:5` |
| `className="error-text"` | `components/FieldErrorText.tsx:6` |
| `The server couldn’t be reached or returned an error.` | `components/FailureBanners.tsx:30` and `:49`; `features/service-form/lib/testResult.ts:29` (the test panel's own sentence) |

A separate search for `Reload` outside the words module found no literal left in non-test code.

## Mutation checks run

Each was applied to the source, the named tests run, then reverted (`git status` clean after each).

| # | Mutation | Result |
|---|---|---|
| M1 | Change a word in `REQUEST_NOT_ACCEPTED_TEXT` | 6 fail: `FailureBanners`, `requestNotAccepted`, `TargetDialog` (2), `AddServiceForm`, `ServiceForm` |
| M2 | Drop `onKeep` from `onClose` in `DiscardDialog` | 3 fail: `DiscardDialog`, `TargetDialog` (leaving), `AddServiceForm` (Esc) |
| M3 | Drop the `onGoToField` call in `ErrorSummary` | 9 fail: `ErrorSummary`, `TargetDialog` (422), 7 in `AddServiceForm` |
| M4 | `csrfToast` reloads twice | 9 fail: `SessionProvider` (2), `useRemoveTarget` (2), `useDeleteService`, `usePauseService`, `usePublicView`, `ServiceList`, `requestNotAccepted` |
| M5a | `useRemoveTarget` back to a literal with different words | 3 fail: `useRemoveTarget` (2, including the new case) and `AlertList` |
| M5b | `SessionProvider` back to a literal with different words | 2 fail, including the new case |
| M6 | Row-focus fallback changed (previous row replaced by Add button) | 5 fail: `useRowFocus`, `NameValueRows`, `TargetDialog`, `HealthRulesGroup`, `RequestRowsGroup` |
| M7 | Change a word in the toast message | 11 fail across the dashboard, the alert list, `SessionProvider` and the words module |
| M8 | Drop `disabled` from the load-failed banner | 2 fail: `FailureBanners`, `AlertList` |
| M9a | Drop the explicit `aria-hidden` on the field-error icon | No failure: equivalent mutant, because lucide sets `aria-hidden="true"` by default |
| M9b | Drop `id` from `FieldErrorText` | 64 fail |
| M10 | Change the `Reload` label | 7 fail, including the test panel (`TestPanel`) and both forms |

## Cases tried beyond the task file

- **Nested discard question in the alert list:** M2 breaks the existing `TargetDialog` leaving test, which opens the question inside the dialog. It is covered.
- **Edit form load failure, sign-out 403, delete 403, public switch 403:** each has an existing test (`EditServiceForm`, `SessionProvider`, `useDeleteService` and `ServiceList`, `usePublicView` and `ServiceList`). M4 and M7 broke them, so they check the shared text.
- **Header rows added and removed at each position:** M6 breaks the existing next, previous and only-row cases in `NameValueRows`, `TargetDialog`, `HealthRulesGroup` and `RequestRowsGroup`. Removing the first of several rows keeps focus at the same index; this is covered by the "next row" cases.
- **Exact boundaries:** `summaryTitle(1)` against 3 and 4 is tested. `summaryTitle(0)` gives `0 fields need…`, as before; the old copies did the same and the component requires at least one entry.
- **Markup in messages:** shown as text in `FieldErrorText` and `ErrorSummary`. A `null` `inputId` renders no link.
- **Concurrent writes:** not applicable; no request or state changes.

## Integration tests

Not run: no backend or integration-tagged code is touched, so `make test-integration` does not apply. No criterion depends only on an integration test. All criteria rest on the unit tests that `make check` ran.

## Findings

### Blocking

None.

### Non-blocking

- **N1 (test quality): the `ErrorSummary` title test renders twice in one test** and clears the page with `document.body.innerHTML = ''` between renders (`components/ErrorSummary.test.tsx`). Matters when: the test gets a third render, or testing-library's cleanup changes, since the manual reset hides the first render's leftovers. Splitting it into two cases would remove the need.
- **N2 (test quality): the new `useRemoveTarget` and `SessionProvider` cases compare against the words module's constants.** A user reverted to an *identical* literal passes them, and only the module test would notice a later change to the shared text. The criterion's intent (a change to the shared module reaches both) is met by M5a, M5b and M7, where the existing literal-asserting tests fail. Matters when: someone replaces `csrfToast()` in one of the two with a copy of the same words. The new cases would then still pass, so the copy would go unnoticed until the words change.
- **N3 (cosmetic): `rowActionToasts.test.ts` keeps an `afterEach` that unstubs globals although no case stubs one any more.** The plan states it. Matters when: someone edits that file and wonders why it is there. Report only.

## Docs or specs that no longer match

- `docs/openapi.yaml`, `docs/requirements.md`: nothing; no contract, requirement or behavior changed.
- `STACK.md`: no dependency added or changed; no version to record.
- `docs/tasks/backlog.md`: line 52 (left out of `share-form-parts`) still stands; the `toOutcome` copies and the two server-error hooks remain apart, as the task file intended.
- `ARCHITECTURE.md` describes `hooks/` as "generic hooks with no feature dependencies" and `components/` as shared UI; the new files fit. No update needed.
- `docs/design/`: nothing; no visual change.
