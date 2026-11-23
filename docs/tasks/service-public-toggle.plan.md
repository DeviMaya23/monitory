# Plan: service public page toggle

Branch: feat/service-public-toggle. All paths under `frontend/src/features/service-form/` unless noted.

- [x] `toServiceInput` sends the flag (true/false, HTTP and TCP); `toFormValues` gives true/false/false for true/false/absent; round trip keeps it — `lib/serviceInput.ts`, `lib/serviceInput.test.ts`
- [x] `ADD_DEFAULT_VALUES.shown_on_public_view` is `false` — `lib/formValues.ts`, test in `lib/serviceInput.test.ts`
- [x] `useUpdateService` sends the form's value, body is exactly `toServiceInput(values)` — `hooks/useUpdateService.ts`, `hooks/useUpdateService.test.tsx`
- [x] Group: legend, switch, description, follows the value, toggles, disabled while saving — `components/PublicPageGroup.tsx`, `lib/publicPageGroup.ts`, `components/PublicPageGroup.test.tsx`
- [x] Add idle: group last, after Alerts, before test panel, off; untouched sends false; on sends true — `components/AddServiceForm.test.tsx`
- [x] Edit shown/hidden: switch state, unchanged sends as loaded, toggled sends the opposite — `components/EditServiceForm.test.tsx`
- [x] Leaving: changed status, Cancel and back link ask, unload prompt armed; putting back clears (Add and Edit) — `components/AddServiceForm.test.tsx`, `components/EditServiceForm.test.tsx`, `lib/formChanged.test.ts`
- [x] In flight: disabled while pending, enabled after failure — `components/AddServiceForm.test.tsx`
- [x] Tab order: Recovery message → switch → Run test → Cancel; Space toggles — `components/AddServiceForm.test.tsx`
- [x] 422 naming `shown_on_public_view`: plain-text summary, no link, no input marked, no error under switch — `components/AddServiceForm.test.tsx`
- [x] TCP form shows the group and sends the value — `components/AddServiceForm.test.tsx`
- [x] `ServiceForm.tsx` renders the group after Alerts — `components/ServiceForm.tsx`
- [x] `make check` passes: run, passed
- [x] Nothing outside allowed paths changed; package files unchanged
- [x] Integration tests (`make test-integration`): not run: frontend-only task, no Go code or integration tests touched

## Judgment calls

- `ServiceForm.test.tsx` already exists (merged with `service-test-panel`), although the task says it does not. I did not create it; I edited its two Tab-order cases (add and edit) because the last group is now Public page and Tab goes Recovery message, switch, Run test, Cancel.
- The Edit "with nothing changed" case in `EditServiceForm.test.tsx` keeps its expectation unchanged; it still passes, now through the form control.
- The Public page tests for Add and Edit were appended as new `describe` blocks at the end of the existing test files.
- `App.test.tsx`: only the one `createService` body assertion gained `shown_on_public_view: false`.
- Not checked in a browser: layout and focus outline were checked by reading CSS only.
