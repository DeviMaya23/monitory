# Plan: service form alerts

Branch: `feat/service-form-alerts`. All paths under `frontend/src/`. Tick as done; integration tests do not apply (frontend-only task).

## Acceptance criteria

- [x] **Switch `description`**: hint shown, name is label alone, hint is the description, clicking hint toggles, no hint without prop. File `components/ui/Switch.tsx`; test `components/ui/Switch.test.tsx`.
- [x] **fieldLabels / fieldIds**: the two new targets, labels and ids; unknown paths unchanged. Files `features/service-form/lib/fieldLabels.ts`, `fieldIds.ts`; test `lib/fieldLabels.test.ts` (ids covered there too).
- [x] **useCreateService body**: three new keys, untrimmed, defaults true/''/''. File `hooks/useCreateService.ts`; test `hooks/useCreateService.test.tsx`.
- [x] **useLeaveGuard "changed"**: false at start; true for switch off, one-space message, text; false again when restored. File `hooks/useLeaveGuard.ts`; test `hooks/useLeaveGuard.test.tsx`.
- [x] **Idle group**: Alerts group after Request, switch on and described, two labelled text areas with placeholder, rows 3, no maxlength, counters 0/500, footer empty, buttons unchanged. Files `components/AlertsGroup.tsx`, `AddServiceForm.tsx`; tests `AlertsGroup.test.tsx`, `AddServiceForm.test.tsx`.
- [x] **Counter**: 12 chars, emoji as one, paste 501 kept `501/500`, 500 gives `500/500` and no error. Test `AlertsGroup.test.tsx`.
- [x] **Send**: untouched body, switch off with typed `'  down '` and `<b>x</b>`, messages sent when off. Test `AddServiceForm.test.tsx`.
- [x] **In flight**: switch disabled, text areas read-only, editable after failure. Test `AddServiceForm.test.tsx`.
- [x] **422 for the messages**: summary order and labels, field errors with aria, links focus text areas, summary focus, markup as text, first of two errors, edit clears only that one, `settings` stays plain. Test `AddServiceForm.test.tsx`.
- [x] **Leaving**: switch off is changed (footer, Cancel dialog, unload), back on is not, one space is changed. Test `AddServiceForm.test.tsx`.
- [x] **Replaced cases** in `AddServiceForm.test.tsx` and `useCreateService.test.tsx` as the task lists.
- [x] **Repo-wide**: `make check` passes (run, passed); only allowed paths changed; package files unchanged.

## Integration tests

`make test-integration`: not run: no backend code touched, no integration tests cover this frontend task.

## Judgment calls

- `App.test.tsx` also asserted the old request body (`toHaveBeenCalledWith`); the task did not list it. I added the three new keys to its expectation (same change as the listed cases, nothing loosened).
- Two feature files the task did not name: `lib/alertsGroup.ts` (the `MESSAGE_MAX` constant, the group's strings, the code-point counter) and `components/FieldErrorText.tsx` (the field error paragraph, moved out of `AddServiceForm.tsx` so `AlertsGroup` reuses it; `errorId` moved to `lib/fieldIds.ts`, because the lint rule forbids a component file exporting a function).
- The Base UI switch is a `span role=switch`, so tests check `aria-disabled` rather than `disabled`.
- `Switch` sets `aria-labelledby`/`aria-describedby` and the label's id only when `description` is given, so the default render is unchanged.
- The backlog line the task asks for (the edit task builds the same group) was not added: I may change no file under `docs/` but this one. The drafter should add it.
- Prettier is not a project tool; I used it with the repo's evident style only to check formatting, and undid the noise it caused in untouched lines.
