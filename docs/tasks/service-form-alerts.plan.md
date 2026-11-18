# Plan: service form alerts

Branch: `feat/service-form-alerts`. All paths under `frontend/src/`. Tick as done; integration tests do not apply (frontend-only task).

## Acceptance criteria

- [ ] **Switch `description`**: hint shown, name is label alone, hint is the description, clicking hint toggles, no hint without prop. File `components/ui/Switch.tsx`; test `components/ui/Switch.test.tsx`.
- [ ] **fieldLabels / fieldIds**: the two new targets, labels and ids; unknown paths unchanged. Files `features/service-form/lib/fieldLabels.ts`, `fieldIds.ts`; test `lib/fieldLabels.test.ts` (ids covered there too).
- [ ] **useCreateService body**: three new keys, untrimmed, defaults true/''/''. File `hooks/useCreateService.ts`; test `hooks/useCreateService.test.tsx`.
- [ ] **useLeaveGuard "changed"**: false at start; true for switch off, one-space message, text; false again when restored. File `hooks/useLeaveGuard.ts`; test `hooks/useLeaveGuard.test.tsx`.
- [ ] **Idle group**: Alerts group after Request, switch on and described, two labelled text areas with placeholder, rows 3, no maxlength, counters 0/500, footer empty, buttons unchanged. Files `components/AlertsGroup.tsx`, `AddServiceForm.tsx`; tests `AlertsGroup.test.tsx`, `AddServiceForm.test.tsx`.
- [ ] **Counter**: 12 chars, emoji as one, paste 501 kept `501/500`, 500 gives `500/500` and no error. Test `AlertsGroup.test.tsx`.
- [ ] **Send**: untouched body, switch off with typed `'  down '` and `<b>x</b>`, messages sent when off. Test `AddServiceForm.test.tsx`.
- [ ] **In flight**: switch disabled, text areas read-only, editable after failure. Test `AddServiceForm.test.tsx`.
- [ ] **422 for the messages**: summary order and labels, field errors with aria, links focus text areas, summary focus, markup as text, first of two errors, edit clears only that one, `settings` stays plain. Test `AddServiceForm.test.tsx`.
- [ ] **Leaving**: switch off is changed (footer, Cancel dialog, unload), back on is not, one space is changed. Test `AddServiceForm.test.tsx`.
- [ ] **Replaced cases** in `AddServiceForm.test.tsx` and `useCreateService.test.tsx` as the task lists.
- [ ] **Repo-wide**: `make check` passes; only allowed paths changed; package files unchanged.

## Integration tests

`make test-integration`: not run: no backend code touched, no integration tests cover this frontend task.

## Judgment calls

(to fill at the end)
