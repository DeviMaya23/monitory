# Plan: service form JSON rules and certificate options

Branch: `feat/service-form-json-and-cert-rows`. Paths are under `frontend/src/features/service-form/` unless noted.
Integration tests: none apply (frontend only). Outcome: `not run: frontend-only task, no Go code or integration tests touched`.
`make check`: run, passed (see report; no database involved).

## Acceptance criteria

### `lib/jsonRules.ts`, `lib/certificateOptions.ts`
- [x] Rules become `json_rules` in order, text untrimmed, empty text `''`, true/false booleans, none is `[]`, mode passes through. `lib/jsonRules.ts`, `lib/jsonRules.test.ts`
- [x] `certificate_check` off / on (`' 30 '` -> 30) and `ignore_certificate_errors`. `lib/certificateOptions.ts`, `lib/certificateOptions.test.ts`
- [x] URL starts with `https://` (trim, any case). `lib/certificateOptions.test.ts`
- [x] Ids, paths, labels (`fieldLabel` for rule/days/list/mode/switches, input or none). `lib/jsonRules.test.ts`, `lib/fieldLabels.test.ts`, `lib/fieldIds` via `fieldLabels.test.ts`

### `useServerErrors`
- [x] Clearing rule field / failing value / whole list / days / URL group / new response. `hooks/useServerErrors.ts`, `hooks/useServerErrors.test.tsx`

### `useCreateService`, `useLeaveGuard`
- [x] Request `check` carries the four new keys (defaults, and two rules + mode all + switch on + 45). `hooks/useCreateService.test.tsx`
- [x] "Changed" for each new value and back to false. `hooks/useLeaveGuard.test.tsx`
- [x] `useRowFocus` moves focus after Add/Remove. `hooks/useRowFocus.ts`, `hooks/useRowFocus.test.tsx`

### The form
- [x] Idle view (order, texts, disabled HTTPS group, empty footer). `components/AddServiceForm.test.tsx`, `HealthRulesGroup.test.tsx`, `HttpsGroup.test.tsx`
- [x] Rules add/kind/text kept/Remove focus/21 rules. `components/HealthRulesGroup.test.tsx`
- [x] Send rules with kinds and mode; empty path sent. `components/AddServiceForm.test.tsx`
- [x] HTTPS enabling by URL (`HTTPS://` counts), days enable/keep text. `components/HttpsGroup.test.tsx`, `AddServiceForm.test.tsx`
- [x] URL change turns switches off, stays on for https -> https, does not turn back on. `components/AddServiceForm.test.tsx`
- [x] Days kept while off sent when turned on again. `components/AddServiceForm.test.tsx`
- [x] Send certificate options; `abc` while off no client error. `components/AddServiceForm.test.tsx`
- [x] Client check of days (`''`, `abc`, `1.5`, `-3`), focus first invalid, clears on edit/off/URL; `0` sent. `components/AddServiceForm.test.tsx`
- [x] In flight: everything read-only/disabled, editable after failure. `components/AddServiceForm.test.tsx`
- [x] 422 on rule rows (summary, links, aria, focus, markup as text). `components/AddServiceForm.test.tsx`
- [x] 422 on `check.json_rules` list (plain text, no invalid input). `components/AddServiceForm.test.tsx`
- [x] 422 on days / switches. `components/AddServiceForm.test.tsx`
- [x] 422 on mode. `components/AddServiceForm.test.tsx`
- [x] Clearing rules (path, kind/text, Add, Remove, mode, switches, URL, last removal). `components/AddServiceForm.test.tsx`
- [x] `check.url` and rule error together. `components/AddServiceForm.test.tsx`
- [x] Leaving: unsaved status, Cancel dialog, unload prompt. `components/AddServiceForm.test.tsx`
- [x] Tab order. `components/AddServiceForm.test.tsx`
- [x] Replaced-on-purpose tests (check body in `AddServiceForm.test.tsx`, `useCreateService.test.tsx`, `App.test.tsx`; legends; Tab stop counts; radio/button counts; fixtures `VALUES` and `Harness`). Those files.

### Repo-wide
- [x] `make check` passes.
- [x] Nothing outside allowed paths changed; `package.json` and lockfile unchanged.

## Judgment calls
- The URL field's change handler reads the new value from the event and calls `setValue` for both switches; it also clears the client `cert_days` error and calls `clearUrl()`.
- The hidden-label rule in `service-form.css` uses `clip-path: inset(50%)` and `border: 0`, as the built `.sr-only` does, because stylelint rejects the deprecated `clip` the board uses.
- A switch error has no input, so its id is a named constant in `certificateOptions.ts` (`service-cert-enabled-error`, `service-cert-ignore-error`); the list's is `service-rules-error`.
- `readWholeNumber` returning null while the expiry switch is on (cannot happen after validation) sends `{ enabled: true }` with no days, so the server says `required`.
- Disabled Base UI switches expose `aria-disabled`, not the `disabled` attribute, so tests check that.
- In `AddServiceForm.test.tsx` the alerts case that looked for the text `Off` now looks inside the Send alerts row, since the HTTPS switches also say Off. Two Select-heavy cases got a 15 s timeout because they ran near 5 s under parallel load.
- Existing Tab-order cases that went to the Body text or Body type and then Check interval now pass through Add rule and the mode, as the task's item 3 says.
