# Plan: service form timing

Branch: feat/service-form-timing. Prerequisite files checked present on this branch.

## Acceptance criteria

- [x] `lib/timingGroup.ts`: starting values 60/10/2/10; whole-number reading accepts `0`, `60`, ` 12 `, max safe int and rejects `''`, ` `, `-1`, `1.5`, `1e3`, `abc`, `+5`, above max — `lib/timingGroup.test.ts`
- [x] `lib/timingGroup.ts`: longest attempt 50 fits, (30,10,3,10) = 70 exceeds, equal fits (`<=`), zero retries gives timeout — `lib/timingGroup.test.ts`
- [x] `useCreateService`: body has `settings` with four integers (`'45'` → 45; defaults 60/10/2/10), toStrictEqual updated — `hooks/useCreateService.test.tsx`
- [x] `useLeaveGuard`: changed false at start, true when any timing text differs (trailing space), false when put back — `hooks/useLeaveGuard.test.tsx`
- [x] `fieldLabels`/`fieldIds`/`useServerErrors`: four paths map with target and id; bare `settings` → `Timing`, no target; `check.headers[2].value`, `toString` unmapped; group message readable and clearable; clearing a field removes only its entries — `lib/fieldLabels.test.ts`, `hooks/useServerErrors.test.tsx`
- [x] Form idle: Timing group between Request and Alerts, four labelled inputs with defaults, addons, no placeholder/hint, summary line, empty footer — `components/TimingGroup.test.tsx`, `components/AddServiceForm.test.tsx`
- [x] Line updates while typing; hides on empty/letters; exceeds still sends — `components/AddServiceForm.test.tsx`
- [x] Send: untouched body has defaults as integers; typed values; ` 12 ` → 12 — `components/AddServiceForm.test.tsx`
- [x] Client checks: `Enter a whole number.`, focus on first invalid in form order, nothing sent, cleared on edit, two bad fields both show — `components/AddServiceForm.test.tsx`
- [x] In flight: four inputs read-only, editable after failure — `components/AddServiceForm.test.tsx`
- [x] 422 field errors (`Timeout`, `Retries`): summary entries, under-input messages, aria, links focus, summary focus, markup as text, edit clears only its own (and the group error) — `components/AddServiceForm.test.tsx`
- [x] 422 bare `settings`: group error with icon, `group--invalid`, aria-describedby, plain-text `Timing:` entry, edit clears it and the summary — `components/AddServiceForm.test.tsx`
- [x] 422 `check.url` + timing error cleared independently — `components/AddServiceForm.test.tsx`
- [x] Leaving: footer `Unsaved changes`, Cancel asks, unload armed; put back empties — `components/AddServiceForm.test.tsx`
- [x] Tab order URL → four timing inputs → alert switch — `components/AddServiceForm.test.tsx`
- [x] Replaced tests per task file (fieldLabels, useServerErrors, AddServiceForm legend/body/unmapped path, useCreateService, useLeaveGuard Harness, App.test body assertion)
- [x] `make check` passes: run, passed (lint, unit tests, builds, contract lint)
- [x] Nothing outside allowed paths changed; package files unchanged
- [x] Integration tests: not run: no integration tests apply (frontend-only task)

## Judgment calls

- Form value names are `check_interval`, `timeout`, `retries`, `retry_interval` (text); the task file did not name them.
- `useServerErrors` gained `groupError()` and `clearTiming(target)` (clears the field and the group error); `clearField` is unchanged.
- The summary line is three spans (flex items) separated by literal spaces so its text reads as one sentence; `timeout`/`retries` shown as parsed (`007` → `7`).
- A number whose longest attempt would exceed `Number.MAX_SAFE_INTEGER` hides the line (task file), but is still sent if each field is a safe integer.
- Client check is a `validate` rule on each registered timing input (react-hook-form), so first-invalid focus follows registration order: Name, URL, then timing.
- The group error `p.error-text` reuses `FieldErrorText`, placed right after the legend.
- Prettier is not part of the project; I formatted by hand to the existing style (and reverted an accidental repo-wide reformat before committing).
- Behaviour not run in a browser; layout at 360 px unverified.
