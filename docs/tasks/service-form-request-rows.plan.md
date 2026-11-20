# Plan: service form request rows

Branch: feat/service-form-request-rows. Paths are under `frontend/src/`.
Integration tests: none apply (frontend only) — `make test-integration`: not run: task touches no code with integration tests.

## `components/NameValueRows.tsx` (`components/NameValueRows.test.tsx`)
- [ ] Every old `HeaderRows` case still passes with the target dialog's words — `NameValueRows.test.tsx` (moved), `TargetDialog.test.tsx` untouched
- [ ] `itemName="Query parameter"` + emptyText/addLabel, no hint: input, Remove, empty and Add wording; no hint — `NameValueRows.test.tsx`
- [ ] `hint` shows beside Add; group `aria-describedby` names it, and both with a list error — `NameValueRows.test.tsx`
- [ ] Row and list errors as text with aria-invalid/describedby; markup shown as text — `NameValueRows.test.tsx`
- [ ] Two instances share no id — `NameValueRows.test.tsx`
- [ ] `.rows__legend` moved to `styles/components.css`; `HeaderRows.tsx`/test deleted

## `lib/requestRows.ts`, `useCreateService`, `useLeaveGuard`
- [ ] Request body: arrays in order, untrimmed, `[]`, empty row as is; body per type; no `body` for none — `lib/requestRows.test.ts`, `hooks/useCreateService.test.tsx`
- [ ] "Changed" cases — `hooks/useLeaveGuard.test.tsx`
- [ ] Ids, paths, labels; `fieldLabel` mapping; unmapped still self — `lib/requestRows.test.ts`, `lib/fieldLabels.test.ts`

## `useServerErrors`
- [ ] Clear row / list / all rows of a list / body content; new response starts clean — `hooks/useServerErrors.test.tsx`

## The form (`components/AddServiceForm.test.tsx`, `components/RequestRowsGroup.test.tsx`)
- [ ] Idle state and URL description
- [ ] Rows add/remove focus; no client limit
- [ ] Body type shows/hides text
- [ ] Send cases (empty, two query + one header + JSON, empty name, none with text, header in full)
- [ ] In flight read-only/disabled, editable after failure
- [ ] 422 row paths: summary, links, under inputs, focus on summary, markup as text
- [ ] 422 list paths: under list, plain summary, nothing invalid
- [ ] 422 `check.body.type`: plain text
- [ ] Clearing rules
- [ ] 422 `check.url` + row error independent
- [ ] 413 banner second line
- [ ] Leaving / unsaved changes
- [ ] Tab order
- [ ] Replaced tests (the six listed) updated and nothing else loosened

## Repo-wide
- [ ] `make check` passes — outcome: 
- [ ] Only allowed paths changed; package.json / lockfile unchanged

## Judgment calls
(filled at the end)
