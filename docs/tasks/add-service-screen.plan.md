# Plan: add service screen

Branch: `feat/add-service-screen`. Role: Frontend (`frontend/src/**` only, and this plan).

Prerequisites checked on the branch's base (`origin/main`): `Toast.tsx` with `useToast` and `ToastProvider` above the session provider, `lib/api/services.ts` with `Service` and `ServiceList`, `test/fixtures.ts` with `makeService`, the dashboard route and `useServiceList.ts` exporting `SERVICES_KEY`, `Dialog.tsx`, and the `.select-trigger`, `.banner`, `.error-text`, `.field`, `.input` and menu rules. All present. The six Lucide icons named in the task exist in 1.73.0.

One item per acceptance criterion. Ticked when done and passing.

## Blocked: one "Stop and ask" condition applies to one item

- [ ] `useServiceList.ts` uses `servicesQueryKey` from `lib/api/services.ts` and drops its own `SERVICES_KEY`. **Not done, by the task's stop rule** ("the shared query key cannot be shared without changing more of `service-list` than the one use"). With the one edit made, `features/service-list/hooks/useServiceList.test.tsx` ("moves with the constant") fails: its `vi.doMock('../../../lib/api/services', () => ({ listServices }))` factory has no `servicesQueryKey`, so the hook throws on reading it. Making it pass needs a second edit inside `service-list` (that test's mock factory), which the task does not allow. Tried on this branch and reverted. What is done instead: `servicesQueryKey` is exported from `lib/api/services.ts` and `service-form` uses it; `useServiceList.ts` is untouched and keeps `SERVICES_KEY`, which has the same value `['services']`. See "Judgment calls".

## Field labels: `features/service-form/lib/fieldLabels.ts`, test `fieldLabels.test.ts`

- [ ] `name`, `check.method`, `check.url` map to `Name`, `Method`, `URL` with targets; `settings` and `check.headers[2].value` map to themselves with no target; summary title for four and for one (FR-12)

## Select: `components/ui/Select.tsx`, test `Select.test.tsx`

- [ ] Trigger shows the current label; opening lists every option; picking calls `onValueChange`; arrow keys and Enter pick; `disabled` blocks opening; `invalid` sets `aria-invalid`; the label names the trigger

## `useCreateService`: `features/service-form/hooks/useCreateService.ts`, test `useCreateService.test.tsx`

- [ ] 201 is a success with the returned service; the request carries exactly `name`, `check.type` `http`, `check.method`, `check.url` (FR-6)
- [ ] Each response of the Failures table maps to its outcome; 422 keeps two errors in order; the same failure twice is a new outcome (FR-12, FR-59, FR-60, NFR-8)
- [ ] Saving flag true in flight and false after each outcome; a second submit while saving sends nothing
- [ ] A 401 the shell handles gives no outcome

## `useServerErrors`: `features/service-form/hooks/useServerErrors.ts`, test `useServerErrors.test.tsx`

- [ ] Error of `check.url` only on URL; clearing a field removes only its error and entry, count follows; clearing the last empties the summary; a second error on a path keeps the first on the field and both in the summary; an unmapped path is in the summary with no target

## `useLeaveGuard`: `features/service-form/hooks/useLeaveGuard.ts`, test `useLeaveGuard.test.tsx`

- [ ] Changed rule: pristine; by name, by URL, by method; a name of only spaces; URL as the input holds it
- [ ] Cancel pristine goes on with no dialog; changed opens the dialog and stays; `Keep editing` closes and stays; `Discard changes` goes on
- [ ] Unload prompt armed only while changed, not saving, not after a success; removed on unmount (harness component, `beforeunload` and `defaultPrevented`)

## The screen: `features/service-form/components/AddServiceForm.tsx`, tests `AddServiceForm.test.tsx` and `App.test.tsx`

- [ ] Idle state — `AddServiceForm.test.tsx`
- [ ] Saving a valid form, then the 201: at `/`, cache entry gone, toast with the response's name, no dialog or unload prompt (FR-6, FR-12) — `AddServiceForm.test.tsx`
- [ ] Method select lists the nine in order; `PATCH` sends `PATCH`; default sends `GET` (FR-36) — `AddServiceForm.test.tsx`
- [ ] Enter in Name and in URL submits once; Enter while in flight sends nothing; a double click sends one request (NFR-4) — `AddServiceForm.test.tsx`
- [ ] Client checks: `Enter a name.`, `Enter a URL.`, both at once focus Name, nothing sent, editing clears, a non-http(s) URL is sent — `AddServiceForm.test.tsx`
- [ ] 422 on `name`, `check.url`, `check.method`: messages, `aria-invalid`, `aria-describedby`, summary title and order, summary focused, links move focus, editing removes entries and then the summary (FR-12, FR-74, NFR-4) — `AddServiceForm.test.tsx`
- [ ] 422 for `settings`: plain text in the summary, no field error — `AddServiceForm.test.tsx`
- [ ] 409 `service_name_taken`: text under Name, Name focused, no summary or banner, values kept, buttons enabled, editing clears (FR-59) — `AddServiceForm.test.tsx`
- [ ] 409 `service_limit_reached`: banner, both lines, `Back to services` to `/` with no dialog, values stay, no field error (FR-60) — `AddServiceForm.test.tsx`
- [ ] 413: banner title and second line; values stay — `AddServiceForm.test.tsx`
- [ ] 403 `csrf_failed`: banner with `Reload`, `window.location.reload` once; values stay (NFR-8) — `AddServiceForm.test.tsx`
- [ ] 500 and a network failure: generic banner; `Try again` resends the same values, success navigates; banner gone when the retry starts — `AddServiceForm.test.tsx`
- [ ] A new submit clears the previous banner, field errors and summary before the request goes — `AddServiceForm.test.tsx`
- [ ] 401 `unauthenticated` ends on the sign-in form with the notice and no banner (FR-4) — `App.test.tsx`
- [ ] Leaving: Cancel and the back link, pristine and changed; dialog with `Keep editing` focused; `Keep editing` and Esc; `Discard changes`; `Unsaved changes` status; Cancel disabled while saving — `AddServiceForm.test.tsx`
- [ ] A name with `<b>x</b>` shows as text in the toast (NFR-7) — `AddServiceForm.test.tsx`
- [ ] Focus after a failure: `Save service` after 403, 413, 409 limit and generic (also by Enter); Name after 409 name; summary after 422 — `AddServiceForm.test.tsx`
- [ ] Leaving while saving: back link goes to `/` at once, no dialog; the later 201 removes the cache entry and shows no toast — `AddServiceForm.test.tsx`
- [ ] A 422 message with `<b>x</b>` renders as text on the field and in the summary (NFR-7) — `AddServiceForm.test.tsx`
- [ ] With the real dashboard: a valid submit ends with the toast and the new service's row (FR-6) — `App.test.tsx`
- [ ] Routes: `/services/new` shows the form in the layout; `/services/some-id` and the others keep placeholders; the signed-out gate still covers `/services/new` (FR-4) — `App.test.tsx`

## Repo-wide

- [ ] `make check` passes
- [ ] Nothing outside the allowed paths changed; `package.json` and `package-lock.json` unchanged

## Integration tests

- `make test-integration`: not run: frontend-only task, no Go code and no code with integration tests is touched.
