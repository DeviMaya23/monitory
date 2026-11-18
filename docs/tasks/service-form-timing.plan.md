# Plan: service form timing

Branch: feat/service-form-timing. Prerequisite files checked present on this branch.

## Acceptance criteria

- [ ] `lib/timingGroup.ts`: starting values 60/10/2/10; whole-number reading accepts `0`, `60`, ` 12 `, max safe int and rejects `''`, ` `, `-1`, `1.5`, `1e3`, `abc`, `+5`, above max — `lib/timingGroup.test.ts`
- [ ] `lib/timingGroup.ts`: longest attempt 50 fits, (30,10,3,10) = 70 exceeds, equal fits (`<=`), zero retries gives timeout — `lib/timingGroup.test.ts`
- [ ] `useCreateService`: body has `settings` with four integers (`'45'` → 45; defaults 60/10/2/10), toStrictEqual updated — `hooks/useCreateService.test.tsx`
- [ ] `useLeaveGuard`: changed false at start, true when any timing text differs (trailing space), false when put back — `hooks/useLeaveGuard.test.tsx`
- [ ] `fieldLabels`/`fieldIds`/`useServerErrors`: four paths map with target and id; bare `settings` → `Timing`, no target; `check.headers[2].value`, `toString` unmapped; group message readable and clearable; clearing a field removes only its entries — `lib/fieldLabels.test.ts`, `hooks/useServerErrors.test.tsx`
- [ ] Form idle: Timing group between Request and Alerts, four labelled inputs with defaults, addons, no placeholder/hint, summary line, empty footer — `components/TimingGroup.test.tsx`, `components/AddServiceForm.test.tsx`
- [ ] Line updates while typing; hides on empty/letters; exceeds still sends — `components/AddServiceForm.test.tsx`
- [ ] Send: untouched body has defaults as integers; typed values; ` 12 ` → 12 — `components/AddServiceForm.test.tsx`
- [ ] Client checks: `Enter a whole number.`, focus on first invalid in form order, nothing sent, cleared on edit, two bad fields both show — `components/AddServiceForm.test.tsx`
- [ ] In flight: four inputs read-only, editable after failure — `components/AddServiceForm.test.tsx`
- [ ] 422 field errors (`Timeout`, `Retries`): summary entries, under-input messages, aria, links focus, summary focus, markup as text, edit clears only its own (and the group error) — `components/AddServiceForm.test.tsx`
- [ ] 422 bare `settings`: group error with icon, `group--invalid`, aria-describedby, plain-text `Timing:` entry, edit clears it and the summary — `components/AddServiceForm.test.tsx`
- [ ] 422 `check.url` + timing error cleared independently — `components/AddServiceForm.test.tsx`
- [ ] Leaving: footer `Unsaved changes`, Cancel asks, unload armed; put back empties — `components/AddServiceForm.test.tsx`
- [ ] Tab order URL → four timing inputs → alert switch — `components/AddServiceForm.test.tsx`
- [ ] Replaced tests per task file (fieldLabels, useServerErrors, AddServiceForm legend/body/unmapped path, useCreateService, useLeaveGuard Harness, App.test body assertion)
- [ ] `make check` passes: not run yet
- [ ] Nothing outside allowed paths changed; package files unchanged
- [ ] Integration tests: not run: no integration tests apply (frontend-only task)

## Judgment calls

(filled at the end)
