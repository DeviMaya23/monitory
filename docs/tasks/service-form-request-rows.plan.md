# Plan: service form request rows

Branch: feat/service-form-request-rows. Paths are under `frontend/src/`.
Integration tests: `make test-integration`: not run: the task touches only frontend code, which has no integration tests (Docker/Mailpit tests cover the Go mailer only).

## `components/NameValueRows.tsx` (`components/NameValueRows.test.tsx`)
- [x] Every old `HeaderRows` case still passes with the target dialog's words — `NameValueRows.test.tsx` (moved), `TargetDialog.test.tsx` untouched
- [x] `itemName="Query parameter"` + emptyText/addLabel, no hint: input, Remove, empty and Add wording; no hint — `NameValueRows.test.tsx`
- [x] `hint` shows beside Add; group `aria-describedby` names it, and both with a list error — `NameValueRows.test.tsx`
- [x] Row and list errors as text with aria-invalid/describedby; markup shown as text — `NameValueRows.test.tsx`
- [x] Two instances share no id — `NameValueRows.test.tsx`
- [x] `.rows__legend` moved to `styles/components.css`; `HeaderRows.tsx`/test deleted

## `lib/requestRows.ts`, `useCreateService`, `useLeaveGuard`
- [x] Request body: arrays in order, untrimmed, `[]`, empty row as is; body per type; no `body` for none — `lib/requestRows.test.ts`, `hooks/useCreateService.test.tsx`
- [x] "Changed" cases — `hooks/useLeaveGuard.test.tsx`
- [x] Ids, paths, labels; `fieldLabel` mapping; unmapped still self — `lib/requestRows.test.ts`, `lib/fieldLabels.test.ts`

## `useServerErrors`
- [x] Clear row / list / all rows of a list / body content; new response starts clean — `hooks/useServerErrors.test.tsx`

## The form (`components/AddServiceForm.test.tsx`, `components/RequestRowsGroup.test.tsx`)
- [x] Idle state and URL description
- [x] Rows add/remove focus; no client limit
- [x] Body type shows/hides text
- [x] Send cases (empty, two query + one header + JSON, empty name, none with text, header in full)
- [x] In flight read-only/disabled, editable after failure
- [x] 422 row paths: summary, links, under inputs, focus on summary, markup as text
- [x] 422 list paths: under list, plain summary, nothing invalid
- [x] 422 `check.body.type`: plain text
- [x] Clearing rules
- [x] 422 `check.url` + row error independent
- [x] 413 banner second line
- [x] Leaving / unsaved changes
- [x] Tab order
- [x] Replaced tests (the six listed) updated and nothing else loosened

## Repo-wide
- [x] `make check` passes — outcome: run, passed (861 frontend tests; Go checks, lint, contract lint and builds green)
- [x] Only allowed paths changed; package.json / lockfile unchanged

## Judgment calls
- Existing tests changed beyond the six listed items, all consequences of the mandated changes: the other tests asserting the URL's old hint text now expect the new hint; the legends test selects `legend.group__legend`; the "no Type control" test now allows exactly the Body type radio group and lists the new Add buttons in the button order; the two Tab-order tests gained the three new stops.
- `check.body.type` has no message under any input (the task gives it only a summary entry); no `RadioGroup` change.
- Row paths are mapped for `value` of query parameters too (the server lists only `name` for them), so a future server error there would link to the input.
- `ROW_LISTS` in `lib/requestRows.ts` holds the words once; the target dialog passes its own words inline since its legend carries an `(optional)` mark.
- Board's `.stack` wrapper is used inside the Request group, so no new CSS was needed in `service-form.css`.
- Test timeouts seen in earlier full runs came from the machine being asleep/overloaded; the final `make check` run passed.
