# Verification report: add service screen

Branch: `verify/add-service-screen` (the builder's work is `feat/add-service-screen` at `9ef4566`; this branch is that commit plus this report).

Result: **no Blocking findings.** `make check` passes. Four Non-blocking findings, none of which breaks a requirement ID or an acceptance criterion.

- `make check`: run, passed (18 frontend test files, 271 tests, ESLint, stylelint, Go tests with the race detector, contract lint, both builds).
- Integration tests: not run. This task changes only `frontend/src/**` and its plan; it touches no Go code and no code that has integration tests (`make test-integration` covers the mailer only). No criterion depends on them.
- Live run: no. I did not start the built app or open it in a browser. Layout, sticky footer, 360 px stacking and the focus outline were checked by reading the CSS (see "Rule checks" and finding N3).

## Criteria

"Real?" says whether the named test fails if the behaviour is removed. "Yes (M#)" means I broke the behaviour and watched the test fail (see "Mutation checks run"); "Yes (read)" means I judged it by reading the test only.

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| 1 | Labels and targets for `name`, `check.method`, `check.url`; unmapped paths map to themselves; summary title for four and one (FR-12) | `lib/fieldLabels.test.ts` | Yes (read): pure function, exact strings | Met |
| 2 | Select: trigger shows the label; opening lists every option; pick calls `onValueChange`; arrows and Enter; `disabled` blocks opening; `invalid` sets `aria-invalid`; label names the trigger | `components/ui/Select.test.tsx` (5 tests) | Yes (M15 for `invalid`; the rest by read) | Met |
| 3 | 201 is a success; request carries exactly `name` and `check.{type,method,url}` (FR-6) | `useCreateService.test.tsx` "is a success with the returned service, and the request has only…" | Yes (M1) | Met |
| 4 | Each failure maps to its outcome; 422 keeps two errors in order; a repeated failure is a new object (FR-12, FR-59, FR-60, NFR-8) | `useCreateService.test.tsx` "failures" (one row per response) | Yes (M2, M4) | Met |
| 5 | Saving flag true in flight, false after each outcome; a second submit while saving sends nothing | `useCreateService.test.tsx` "saving" | Yes (M8) | Met |
| 6 | A 401 the shell handles gives no outcome | `useCreateService.test.tsx` | Yes (read): classifier returns `null` only for 401 `unauthenticated`; any other 401 would be a banner | Met |
| 7 | `useServerErrors`: per-field error, clear by field, count, last one empties, duplicate path, unmapped path | `useServerErrors.test.tsx` | Yes (read) | Met |
| 8 | `useLeaveGuard` changed rule: pristine, name, URL, method, spaces-only name compared as typed | `useLeaveGuard.test.tsx` "changed" | Yes (M12) | Met |
| 9 | Cancel pristine and changed; Keep editing; Discard changes | `useLeaveGuard.test.tsx` "Cancel and the back link" | Yes (M14 for the saving case; the rest by read) | Met |
| 10 | Unload prompt armed only while changed, not saving, not after success; removed on unmount | `useLeaveGuard.test.tsx` "the unload prompt" (harness with `render()`) | Yes (M9, M13) | Met |
| 11 | Idle state: heading, back link to `/`, Name focused, `GET`, placeholder, hint, enabled buttons, empty status, no banner, counter, Type control | `AddServiceForm.test.tsx` "idle" (2 tests) | Yes (read) | Met |
| 12 | Saving a valid form: request as typed, in-flight lock, 201 goes to `/`, cache entry gone, toast uses the response's name, no dialog or prompt (FR-6, FR-12) | `AddServiceForm.test.tsx` "sends what was typed, locks the form in flight…" | Yes (M6, M7) | Met |
| 13 | Method list: nine in order; `PATCH` sent; `GET` default (FR-36) | `AddServiceForm.test.tsx` "the method (FR-36)" | Yes (read): exact option list and sent value | Met |
| 14 | Enter in Name and URL submits once; Enter while in flight sends nothing; double click one request (NFR-4) | `AddServiceForm.test.tsx` "submitting from the keyboard" (4 tests) | Yes (M8 for the same-tick case; the rest by read) | Met |
| 15 | Client checks: empty and spaces-only name and URL; both at once focus Name; editing clears; a non-http(s) URL is sent | `AddServiceForm.test.tsx` "client checks" | Yes (M11) | Met |
| 16 | 422 on three fields: server messages, `aria-invalid`, `aria-describedby`, summary title, order, focus, links, edits shrink then remove the summary (FR-12, FR-74, NFR-4) | `AddServiceForm.test.tsx` "422 validation_failed" (3 tests) | Yes (M10) | Met |
| 17 | 422 for `settings`: plain text in the summary, no field error | `AddServiceForm.test.tsx` "lists an unmapped path as plain text…" | Yes (read) | Met |
| 18 | 409 `service_name_taken`: text under Name, focus, no summary or banner, values kept, editing clears (FR-59) | `AddServiceForm.test.tsx` "409 service_name_taken" | Yes (M2, M3) | Met |
| 19 | 409 `service_limit_reached`: banner, both lines, `Back to services` leaves with no dialog (FR-60) | `AddServiceForm.test.tsx` "the banners" | Yes (M4) | Met |
| 20 | 413 banner with both lines, values stay | `AddServiceForm.test.tsx` "413" | Yes (read): exact strings | Met |
| 21 | 403 `csrf_failed`: `Reload` calls `window.location.reload` once (NFR-8) | `AddServiceForm.test.tsx` "403 csrf_failed" | Yes (M5) | Met |
| 22 | 500 and network failure: generic banner; `Try again` resends; banner gone when the retry starts | `AddServiceForm.test.tsx` "the banners" `it.each` | Yes (read) | Met |
| 23 | A new submit clears banner, field errors and summary first | `AddServiceForm.test.tsx` "a new submit clears what the last one left" (4 tests) | Yes (read): each asserts the element is gone while the request is pending | Met |
| 24 | 401 ends on the sign-in form with the notice and no banner (FR-4) | `App.test.tsx` "a 401 unauthenticated ends on the sign-in form…" | Yes (read): the mock runs the registered handler | Met |
| 25 | Leaving: untouched Cancel and back link; dialog with `Keep editing` focused; Keep and Esc; Discard; `Unsaved changes`; Cancel disabled while saving; focus returns to the opener | `AddServiceForm.test.tsx` "leaving" | Yes (M14 for the saving case; rest by read) | Met |
| 26 | `<b>x</b>` in the name shows as text in the toast (NFR-7) | `AddServiceForm.test.tsx` "shows a name with markup as text in the toast" | Partly: React escapes text by default, so only adding `dangerouslySetInnerHTML` would fail it. No such use exists in the diff (grep) | Met |
| 27 | Focus after each failure: Save after 403, 413, limit, generic (also by Enter); Name after 409 name; summary after 422 (NFR-4) | `AddServiceForm.test.tsx` "focus after a failure" (4 tests) | Yes (M10 for the summary; rest by read) | Met |
| 28 | Leaving while saving: back link goes at once; the later 201 drops the cache entry and shows no toast | `AddServiceForm.test.tsx` "while saving, the back link goes to / at once…" | Yes (M14, M6) | Met |
| 29 | A 422 message with `<b>x</b>` renders as text on the field and in the summary (NFR-7) | `AddServiceForm.test.tsx` "renders a server message with markup as text" | Partly: same as 26 | Met |
| 30 | Real dashboard: submit ends with the toast and the new row (FR-6) | `App.test.tsx` "a valid submit ends on the dashboard with the toast and the new service's row" and "after a visit to the dashboard, the 201 drops the cached list" | Yes (M6 fails both) | Met |
| 31 | Routes: `/services/new` shows the form in the layout; other routes keep placeholders; the signed-out gate still covers `/services/new` (FR-4) | `App.test.tsx` "App routes" | Yes (read): the gate row stays in `adminRoutes` | Met |
| 32 | `make check` passes | run by me | n/a | Met |
| 33 | Nothing outside the allowed paths changed; `package.json` and the lockfile unchanged | `git diff origin/main...HEAD --stat` | n/a | Met (see N1 for the one Structure item not done) |

## Plan check (`docs/tasks/add-service-screen.plan.md`)

- Every acceptance criterion has an item. The plan splits criteria 11 to 31 into per-behaviour items; nothing is missing.
- Every ticked item has a test that exists and checks the behaviour (rows above).
- Differences between plan and diff:
  - The plan lists the shared query key as **not done** (blocked item) and the diff agrees: `useServiceList.ts` is untouched. The task file's Structure section asks for the change, so this is an unmet Structure item, reported as N1.
  - The plan says `.menu-layer` was added to `styles/components.css`; the diff has exactly that one rule.
  - The plan says `test/setup.ts` is unchanged; true.
  - The plan says the "Likely visible defect" about portals and the "Possible stale dashboard" were not fixed. I confirmed both: N3 (by CSS selector reading) and N2 (reproduced).
- The plan's other judgment calls (`useWatch` for `watch`, focus by element id, `saved` flag, `.form-banners:empty`) match the code.

## Rule checks

- **Dependencies.** None added. `frontend/package.json` and `package-lock.json` are not in the diff. Libraries used (Base UI Select, react-hook-form, TanStack Query, react-router, Lucide) are those the task file names.
- **Ownership.** Changed paths are all under `frontend/src/` plus the plan. No `backend/`, `docs/` (other than the plan), `main.tsx`, `request.ts` or `schema.d.ts` change. `styles/components.css` gained one rule, named in the plan.
- **Component library.** Only `components/ui/Select.tsx` imports `@base-ui/react/select` and only `components/ui/Dialog.tsx` imports its Dialog (grep). No hand-written select, dialog or toast. Icons are Lucide only; `WifiOff` is what the board draws for the generic banner.
- **Design reference.** The CSS is values and rules, not board markup. No component code copied. Literals in `service-form.css`: `128px` (the board's), `6px` and `18px` (the board's inline styles, no token exists for those values), `.menu-layer` `z-index: 10`. Everything else uses tokens.
- **Layering.** `features/service-form/` imports nothing from `app-shell/` or another feature (grep of its imports: only `components/ui`, `lib/api`, `test`). The key is exported from `lib/api/services.ts`; see N1 for the other half.
- **Hooks (CONVENTIONS "Component and hook granularity").** One hook per concern with colocated tests, written with the hook. Mutators are semantic (`clearField`, `clearFailure`, `keepEditing`, `discard`); DOM handlers are grouped (`backLinkProps`). The unload listener is tested through a harness with `render()`.
- **Server data and text.** The request is built from `name`, the method and the URL only. 422 errors live in `useServerErrors` as a reference to the last outcome plus the set of edited fields; they are not copied. The classifier branches on `ApiError.status` and `code`, never on text. No `dangerouslySetInnerHTML` anywhere in `frontend/src`. Field messages come from the server; the only client-side messages are `Enter a name.`, `Enter a URL.` and the 409 wording the task gives.
- **Wording.** Each string of the Failures table, the dialog and the toast appears once, in `FormBanners.tsx`, `DiscardDialog.tsx`, `AddServiceForm.tsx` and `fieldLabels.ts`, with the curly quotes and ellipsis as written.
- **Lint suppressions.** None in the diff.
- **Dead controls.** None: no Type control, test button, rows, counter or switch (also asserted by the idle test).
- **Keyboard, by reading.** DOM order is back link, Name, Method, URL, Cancel, Save. The summary has `tabindex="-1"`. Inputs use `readOnly` (still focusable) and buttons use `disabled`. The dialog's `initialFocus` is `Keep editing`; the test shows focus returning to the opener.
- **Layout, by reading the CSS.** `.form-foot` is `position: sticky; bottom: 0`. Under `@container app (max-width: 640px)` the method and URL stack, the footer wraps, the status takes the full width and the buttons share a row (`flex: 1 1 0`). These match the board's narrow rules. A browser was not used.
- **Contract.** `createService` is typed with the generated `ServiceInput` and `Service`; `FieldError` and `HttpMethod` come from the generated schema. The three mapped paths are the ones the contract lists. `HttpMethod` (`HttpCheck['method']`) gives the nine methods the select lists.

## Mutation checks run

Each: break the source, run the named test, confirm failure, revert (`git status` clean afterwards).

| # | Break | Result |
|---|---|---|
| M1 | Add `alerts_enabled` to the request body (FR-6) | `useCreateService.test.tsx` fails |
| M2 | Stop classifying `service_name_taken` (FR-59) | `useCreateService.test.tsx` fails |
| M3 | Never show the name-taken text under Name (FR-59) | `AddServiceForm.test.tsx` fails |
| M4 | Classify `service_limit_reached` as generic (FR-60) | hook test and screen test fail |
| M5 | `Reload` does nothing (NFR-8) | `AddServiceForm.test.tsx` fails |
| M6 | Drop `removeQueries` (FR-6) | 5 tests fail across hook, screen and `App.test.tsx` |
| M7 | Toast uses the typed name, not the response's | `AddServiceForm.test.tsx` fails |
| M8 | Remove the in-flight guard | `useCreateService.test.tsx` fails |
| M9 | Unload prompt armed while saving | `useLeaveGuard.test.tsx` fails |
| M10 | After a 422 focus Save, not the summary (NFR-4) | 3 screen tests fail |
| M11 | Remove the URL client check | 4 screen tests fail |
| M12 | Compare the name trimmed in the changed rule | `useLeaveGuard.test.tsx` fails |
| M13 | Unload prompt armed after a success | `useLeaveGuard.test.tsx` fails |
| M14 | Back link asks while saving | hook test and screen test fail |
| M15 | `Select` never sets `aria-invalid` | `Select.test.tsx` fails (2 tests) |

All 15 were caught.

## Findings

### Blocking

None.

### Non-blocking

**N1. The shared query key is not shared (decision needed).** The task's Structure section asks for `useServiceList.ts` to use `servicesQueryKey` and drop its own `SERVICES_KEY`. The builder did not, because the one-line edit makes `useServiceList.test.tsx` ("moves with the constant") fail (its `vi.doMock` factory has no `servicesQueryKey`) and a fix needs a second edit in `service-list`, which the task's stop rule forbids. The builder stopped on that item, reported it in the plan and carried on with the rest. `['services']` now exists twice: `servicesQueryKey` (used by `service-form`) and `SERVICES_KEY` (used by `service-list`). `grep -rn "SERVICES_KEY\|servicesQueryKey" frontend/src` shows both. I agree the stop rule applied.
Matters when: someone changes the value of either key (the form would then drop a cache entry the dashboard does not read). The fix is one line in the test's mock factory plus the one-use edit in the hook, and needs the user's approval because it touches two `service-list` files.

**N2. Dashboard can stay stale when the admin leaves while saving (latent bug).** Reproduced with a throwaway test (not kept): render the real `useServiceList` at `/`, open the form, type a valid form, click `Save service`, click the back link before the response, then resolve the 201. The dashboard still shows only the old row and `listServices` was called once. `removeQueries` drops the cache entry but a query that is already mounted does not refetch, so the new row appears only at the next automatic refresh (`REFRESH_INTERVAL_MS`, FR-95). The task specifies `removeQueries` and lists this path as a known gap ("a request that completes after the admin has left the page still creates the service"), and its criterion 28 checks only that the entry is gone, so this matches the task; the plan raised it too.
Matters when: the admin leaves by the back link while a slow save is in flight, which needs a slow or overloaded server. `invalidateQueries` in addition to `removeQueries` would cover it; the user decides, since it changes what the task specifies.

**N3. Portalled popups sit outside `.app` (cosmetic, report only until a browser check).** `#root` carries the `app` class and Base UI portals render into `body`, so `.app :focus-visible`, the `.app` font and the `@container app` narrow rules do not reach the discard dialog or the method list. By selector semantics the buttons inside the dialog and the select items fall back to the browser's default focus ring and font, not the shared outline (NFR-4 asks for the shared one). `Dialog.tsx` pre-dates this task; the `Select` popup is new here. I did not confirm it in a browser.
Matters when: the user does the milestone check "Each screen the milestone added matches its board" or the release check "The focused field is visibly marked… in the delete dialog" in `docs/manual-checks.md`, or when the delete dialog task builds on the same wrapper.

**N4. Test quality: the "no unload prompt after a 201" assertion in the screen test is weaker than it looks.** After the 201 the form unmounts and navigates, so `unloadPrompts()` being `false` would hold even without the `saved` flag. The behaviour is genuinely pinned by the hook test (M13 fails it), so nothing is unprotected.
Matters when: someone removes the hook test and relies on the screen test alone. Report only.

## Docs or specs that no longer match

- `STACK.md` does not pin versions; the task file records the versions installed (`@base-ui/react` 1.9.0, `react-hook-form` 7.92.0, `@tanstack/react-query` 5.107.1, `react-router` 8.5.1, `lucide-react` 1.73.0). They were already installed by earlier tasks and `package.json` is unchanged here, so there is nothing new to adopt. STACK.md's "Component primitives" row now has a Select wrapper behind it; no wording change needed.
- `docs/design/README.md`: the board's `Request not accepted / unexpected error` and `Name already used` states are now built. The README already lists the differences (server message on a field, `check.url` and `check.method` paths, no counter, discard dialog built). The 413 banner's second line differs from the board (it names the name and the URL, by the task's decision); I did not check whether the README mentions it.
- `docs/tasks/backlog.md`: lines 76 and 78 already record the discard-prompt gap and the missing Type control and test panel. N1, N2 and N3 are not in the backlog; the user decides whether they go there.
- `docs/openapi.yaml` and `docs/requirements.md`: nothing out of date. The contract gives no `message` for a 409, and the screen uses the board's wording as the task directs.
