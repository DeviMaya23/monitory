# Plan: service public page toggle

Branch: feat/service-public-toggle. All paths under `frontend/src/features/service-form/` unless noted.

- [ ] `toServiceInput` sends the flag (true/false, HTTP and TCP); `toFormValues` gives true/false/false for true/false/absent; round trip keeps it — `lib/serviceInput.ts`, `lib/serviceInput.test.ts`
- [ ] `ADD_DEFAULT_VALUES.shown_on_public_view` is `false` — `lib/formValues.ts`, test in `lib/serviceInput.test.ts`
- [ ] `useUpdateService` sends the form's value, body is exactly `toServiceInput(values)` — `hooks/useUpdateService.ts`, `hooks/useUpdateService.test.tsx`
- [ ] Group: legend, switch, description, follows the value, toggles, disabled while saving — `components/PublicPageGroup.tsx`, `lib/publicPageGroup.ts`, `components/PublicPageGroup.test.tsx`
- [ ] Add idle: group last, after Alerts, before test panel, off; untouched sends false; on sends true — `components/AddServiceForm.test.tsx`
- [ ] Edit shown/hidden: switch state, unchanged sends as loaded, toggled sends the opposite — `components/EditServiceForm.test.tsx`
- [ ] Leaving: changed status, Cancel and back link ask, unload prompt armed; putting back clears (Add and Edit) — `components/AddServiceForm.test.tsx`, `components/EditServiceForm.test.tsx`, `lib/formChanged.test.ts`
- [ ] In flight: disabled while pending, enabled after failure — `components/AddServiceForm.test.tsx`
- [ ] Tab order: Recovery message → switch → Run test → Cancel; Space toggles — `components/AddServiceForm.test.tsx`
- [ ] 422 naming `shown_on_public_view`: plain-text summary, no link, no input marked, no error under switch — `components/AddServiceForm.test.tsx`
- [ ] TCP form shows the group and sends the value — `components/AddServiceForm.test.tsx`
- [ ] `ServiceForm.tsx` renders the group after Alerts — `components/ServiceForm.tsx`
- [ ] `make check` passes: not run yet
- [ ] Nothing outside allowed paths changed; package files unchanged
- [ ] Integration tests (`make test-integration`): not run: frontend-only task, no Go code touched

## Judgment calls

(to be filled in)
