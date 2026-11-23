# Plan: share the form parts

Branch: `feat/share-form-parts`. Prerequisites checked: `dashboard-public-switch` (#54), `service-public-toggle` (#53) and `service-test-panel` (#52) are on `main`. All paths are under `frontend/src/`.

Copies found, all as the task describes them (no differences): field error text in `features/service-form/components/FieldErrorText.tsx`, `features/alert-list/components/FieldErrorText.tsx`, `ErrorText` in `components/NameValueRows.tsx`; discard dialogs `DiscardDialog.tsx` and `TargetDiscardDialog.tsx`; summaries `ErrorSummary.tsx` and `TargetErrorSummary`; `summaryTitle` in `fieldLabels.ts` and `targetFields.ts`; csrf/unexpected cases in `FormBanners.tsx` and `TargetDialogBanners.tsx`; load-failed in `EditLoadStates.tsx` and `AlertListBanners.tsx`; test panel csrf text in `features/service-form/lib/testResult.ts` (`TEST_TEXT.csrf`, `.reload`) shown by `TestResult.tsx`; toast literals in `rowActionToasts.ts` (`CSRF_MESSAGE`, `csrfToast`), `useRemoveTarget.ts`, `SessionProvider.tsx`; importers of `csrfToast`: `useDeleteService`, `usePauseService`, `usePublicView`; row focus in `service-form/hooks/useRowFocus.ts` (used by `HealthRulesGroup.tsx`) and the effect in `NameValueRows.tsx`.

## Checklist

- [x] **Field error text**: `components/FieldErrorText.tsx` + `FieldErrorText.test.tsx` (literal message, aria-hidden icon, id). Users: service-form groups and `ServiceForm`, `TargetDialog`, `NameValueRows`; the three copies deleted.
- [x] **Discard question**: `components/DiscardDialog.tsx` + `DiscardDialog.test.tsx` (body prop; Keep focus, Esc/backdrop/Keep call `onKeep`, Discard calls `onDiscard`). Users: `ServiceForm`, `TargetDialog`; both copies deleted.
- [x] **summaryTitle**: `lib/summaryTitle.ts` + `summaryTitle.test.ts` (cases 1, 3, 4 moved from the two old tests, which lose them). Both old functions deleted.
- [x] **Error summary**: `components/ErrorSummary.tsx` + `ErrorSummary.test.tsx` (own entry type `{ key, label, message, inputId }`, handler gets the input id). The service form maps `target` to `fieldId(target)` where it renders it and passes a small `focusById` helper (in `features/service-form/lib/fieldIds.ts`, next to `focusField`); the target dialog passes its entries as they are; both old components deleted.
- [x] **"Request not accepted" words**: `lib/requestNotAccepted.ts` + `requestNotAccepted.test.ts` (title, text, toast message, `Reload` label, `csrfToast()`). `rowActionToasts.ts` drops `CSRF_MESSAGE`/`csrfToast` (cases move); `useDeleteService`, `usePauseService`, `usePublicView` import the shared one; `useRemoveTarget` and `SessionProvider` call `csrfToast()`; one new case each in `useRemoveTarget.test.tsx` and `SessionProvider.test.tsx`.
- [x] **Failure banners**: `components/FailureBanners.tsx` + `FailureBanners.test.tsx` (csrf, unexpected, load-failed). Users: `FormBanners.tsx`, `TargetDialogBanners.tsx`, `EditLoadStates.tsx`, `AlertListBanners.tsx`; test panel notice text and `Reload` label come from the words module via `TEST_TEXT` in `testResult.ts`.
- [x] **Row focus**: `hooks/useRowFocus.ts` + `useRowFocus.test.tsx` (moved with all cases). Users: `HealthRulesGroup.tsx` and `NameValueRows.tsx`; the service-form copy and its test, and the effect in `NameValueRows`, deleted.
- [x] **No copy left**: text search result (below).
- [x] **Existing tests**: service form (Add, Edit), target dialog, alert list, dashboard row actions, `SessionProvider`, `NameValueRows`, test panel pass with only import paths changed.
- [x] **`make check`** passes; `package.json` and the lockfile unchanged.
- [x] **Integration tests**: not run: no backend or integration-tagged code touched (frontend-only task); no integration test applies.

## Search result

Search of `frontend/src` (no tests, no `styles/`), by `grep -rnF`:

- `The request wasn’t accepted.`: `lib/requestNotAccepted.ts` only (title, and the toast message that starts with it).
- `Reload the page and try again.`: `lib/requestNotAccepted.ts` only.
- `Reload and try again.`: `lib/requestNotAccepted.ts` only.
- `Discard unsaved changes?`: `components/DiscardDialog.tsx`, plus one doc comment in `features/alert-list/hooks/useTargetLeaveGuard.ts:16` (not rendered text).
- `fields need fixing before this can be saved`: `lib/summaryTitle.ts` only.
- `className="error-text"`: `components/FieldErrorText.tsx` only.
- `couldn’t be reached or returned an error`: `components/FailureBanners.tsx` (two hits: the unexpected banner's longer sentence and the load-failed banner) and `features/service-form/lib/testResult.ts` (the test panel's own sentence).

## Judgment calls

- **Where the focus helper lives.** The service form's summary handler is `focusById(id)` in `features/service-form/lib/fieldIds.ts`; `focusField` now calls it.
- **The shared summary entry type** `SummaryEntry` is exported from `components/ErrorSummary.tsx`. The two hooks keep their own entry types; the target dialog's entries (which carry an extra `field`) are passed as they are, and the form maps `target` to `inputId` inline where it renders the summary.
- **Banner names:** `CsrfBanner`, `UnexpectedBanner`, `LoadFailedBanner` (the task fixed only the file and the count). `LoadFailedBanner` takes `fetching` and `onRetry`.
- **Words module names:** `REQUEST_NOT_ACCEPTED_TITLE`, `_TEXT`, `_TOAST`, `RELOAD_LABEL`.
- **Test panel notice.** It keeps its markup and its `TEST_TEXT` keys; `TEST_TEXT.csrf` and `.reload` are now built from the words module (title, a space, text).
- **`NameValueRows` focus.** It passes `useRowFocus` a `firstInputId` that wraps its `inputId(index, 'name')`, keeping its old target (the name input).
- **New `useRemoveTarget` and `SessionProvider` cases** compare the toast with the words module's constants (message, `Reload` label) and check the reload count. Mocking the module would also have changed the file's other cases, so I did not.
- **Formatting.** The repo has no Prettier config, so I formatted new files by hand to the existing style (no semicolons, single quotes, trailing commas, width 120).
- **Test helper in `rowActionToasts.test.ts`:** the `afterEach` that unstubs globals stays, though no case there stubs one any more.
