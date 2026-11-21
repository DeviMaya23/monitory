# Plan: service form JSON rules and certificate options

Branch: `feat/service-form-json-and-cert-rows`. Paths are under `frontend/src/features/service-form/` unless noted.
Integration tests: none apply (frontend only). Outcome: `not run: frontend-only task, no Go code or integration tests touched`.

## Acceptance criteria

### `lib/jsonRules.ts`, `lib/certificateOptions.ts`
- [ ] Rules become `json_rules` in order, text untrimmed, empty text `''`, true/false booleans, none is `[]`, mode passes through. `lib/jsonRules.ts`, `lib/jsonRules.test.ts`
- [ ] `certificate_check` off / on (`' 30 '` -> 30) and `ignore_certificate_errors`. `lib/certificateOptions.ts`, `lib/certificateOptions.test.ts`
- [ ] URL starts with `https://` (trim, any case). `lib/certificateOptions.test.ts`
- [ ] Ids, paths, labels (`fieldLabel` for rule/days/list/mode/switches, input or none). `lib/jsonRules.test.ts`, `lib/fieldLabels.test.ts`, `lib/fieldIds` via `fieldLabels.test.ts`

### `useServerErrors`
- [ ] Clearing rule field / failing value / whole list / days / URL group / new response. `hooks/useServerErrors.ts`, `hooks/useServerErrors.test.tsx`

### `useCreateService`, `useLeaveGuard`
- [ ] Request `check` carries the four new keys (defaults, and two rules + mode all + switch on + 45). `hooks/useCreateService.test.tsx`
- [ ] "Changed" for each new value and back to false. `hooks/useLeaveGuard.test.tsx`
- [ ] `useRowFocus` moves focus after Add/Remove. `hooks/useRowFocus.ts`, `hooks/useRowFocus.test.tsx`

### The form
- [ ] Idle view (order, texts, disabled HTTPS group, empty footer). `components/AddServiceForm.test.tsx`, `HealthRulesGroup.test.tsx`, `HttpsGroup.test.tsx`
- [ ] Rules add/kind/text kept/Remove focus/21 rules. `components/HealthRulesGroup.test.tsx`
- [ ] Send rules with kinds and mode; empty path sent. `components/AddServiceForm.test.tsx`
- [ ] HTTPS enabling by URL (`HTTPS://` counts), days enable/keep text. `components/HttpsGroup.test.tsx`, `AddServiceForm.test.tsx`
- [ ] URL change turns switches off, stays on for https -> https, does not turn back on. `components/AddServiceForm.test.tsx`
- [ ] Days kept while off sent when turned on again. `components/AddServiceForm.test.tsx`
- [ ] Send certificate options; `abc` while off no client error. `components/AddServiceForm.test.tsx`
- [ ] Client check of days (`''`, `abc`, `1.5`, `-3`), focus first invalid, clears on edit/off/URL; `0` sent. `components/AddServiceForm.test.tsx`
- [ ] In flight: everything read-only/disabled, editable after failure. `components/AddServiceForm.test.tsx`
- [ ] 422 on rule rows (summary, links, aria, focus, markup as text). `components/AddServiceForm.test.tsx`
- [ ] 422 on `check.json_rules` list (plain text, no invalid input). `components/AddServiceForm.test.tsx`
- [ ] 422 on days / switches. `components/AddServiceForm.test.tsx`
- [ ] 422 on mode. `components/AddServiceForm.test.tsx`
- [ ] Clearing rules (path, kind/text, Add, Remove, mode, switches, URL, last removal). `components/AddServiceForm.test.tsx`
- [ ] `check.url` and rule error together. `components/AddServiceForm.test.tsx`
- [ ] Leaving: unsaved status, Cancel dialog, unload prompt. `components/AddServiceForm.test.tsx`
- [ ] Tab order. `components/AddServiceForm.test.tsx`
- [ ] Replaced-on-purpose tests (check body in `AddServiceForm.test.tsx`, `useCreateService.test.tsx`, `App.test.tsx`; legends; Tab stop counts; radio/button counts; fixtures `VALUES` and `Harness`). Those files.

### Repo-wide
- [ ] `make check` passes.
- [ ] Nothing outside allowed paths changed; `package.json` and lockfile unchanged.

## Judgment calls
(filled at the end)
