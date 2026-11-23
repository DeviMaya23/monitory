# Plan: share the form parts

Branch: `feat/share-form-parts`. Prerequisites checked: `dashboard-public-switch` (#54), `service-public-toggle` (#53) and `service-test-panel` (#52) are on `main`. All paths are under `frontend/src/`.

Copies found, all as the task describes them (no differences): field error text in `features/service-form/components/FieldErrorText.tsx`, `features/alert-list/components/FieldErrorText.tsx`, `ErrorText` in `components/NameValueRows.tsx`; discard dialogs `DiscardDialog.tsx` and `TargetDiscardDialog.tsx`; summaries `ErrorSummary.tsx` and `TargetErrorSummary`; `summaryTitle` in `fieldLabels.ts` and `targetFields.ts`; csrf/unexpected cases in `FormBanners.tsx` and `TargetDialogBanners.tsx`; load-failed in `EditLoadStates.tsx` and `AlertListBanners.tsx`; test panel csrf text in `features/service-form/lib/testResult.ts` (`TEST_TEXT.csrf`, `.reload`) shown by `TestResult.tsx`; toast literals in `rowActionToasts.ts` (`CSRF_MESSAGE`, `csrfToast`), `useRemoveTarget.ts`, `SessionProvider.tsx`; importers of `csrfToast`: `useDeleteService`, `usePauseService`, `usePublicView`; row focus in `service-form/hooks/useRowFocus.ts` (used by `HealthRulesGroup.tsx`) and the effect in `NameValueRows.tsx`.

## Checklist

- [ ] **Field error text**: `components/FieldErrorText.tsx` + `FieldErrorText.test.tsx` (literal message, aria-hidden icon, id). Users: service-form groups and `ServiceForm`, `TargetDialog`, `NameValueRows`; the three copies deleted.
- [ ] **Discard question**: `components/DiscardDialog.tsx` + `DiscardDialog.test.tsx` (body prop; Keep focus, Esc/backdrop/Keep call `onKeep`, Discard calls `onDiscard`). Users: `ServiceForm`, `TargetDialog`; both copies deleted.
- [ ] **summaryTitle**: `lib/summaryTitle.ts` + `summaryTitle.test.ts` (cases 1, 3, 4 moved from the two old tests, which lose them). Both old functions deleted.
- [ ] **Error summary**: `components/ErrorSummary.tsx` + `ErrorSummary.test.tsx` (own entry type `{ key, label, message, inputId }`, handler gets the input id). The service form maps `target` to `fieldId(target)` where it renders it and passes a small `focusById` helper (in `features/service-form/lib/fieldIds.ts`, next to `focusField`); the target dialog passes its entries as they are; both old components deleted.
- [ ] **"Request not accepted" words**: `lib/requestNotAccepted.ts` + `requestNotAccepted.test.ts` (title, text, toast message, `Reload` label, `csrfToast()`). `rowActionToasts.ts` drops `CSRF_MESSAGE`/`csrfToast` (cases move); `useDeleteService`, `usePauseService`, `usePublicView` import the shared one; `useRemoveTarget` and `SessionProvider` call `csrfToast()`; one new case each in `useRemoveTarget.test.tsx` and `SessionProvider.test.tsx`.
- [ ] **Failure banners**: `components/FailureBanners.tsx` + `FailureBanners.test.tsx` (csrf, unexpected, load-failed). Users: `FormBanners.tsx`, `TargetDialogBanners.tsx`, `EditLoadStates.tsx`, `AlertListBanners.tsx`; test panel notice text and `Reload` label come from the words module via `TEST_TEXT` in `testResult.ts`.
- [ ] **Row focus**: `hooks/useRowFocus.ts` + `useRowFocus.test.tsx` (moved with all cases). Users: `HealthRulesGroup.tsx` and `NameValueRows.tsx`; the service-form copy and its test, and the effect in `NameValueRows`, deleted.
- [ ] **No copy left**: text search result (below).
- [ ] **Existing tests**: service form (Add, Edit), target dialog, alert list, dashboard row actions, `SessionProvider`, `NameValueRows`, test panel pass with only import paths changed.
- [ ] **`make check`** passes; `package.json` and the lockfile unchanged.
- [ ] **Integration tests**: not run: no backend or integration-tagged code touched (frontend-only task).

## Search result

_To fill in._

## Judgment calls

_To fill in._
