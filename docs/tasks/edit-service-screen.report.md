# Verification report: edit service screen

Branch: `verify/edit-service-screen` (the verifier's branch, started from `feat/edit-service-screen` at `45dbd4f`; the builder's branch is `feat/edit-service-screen`).

**Result: no Blocking findings.** `make check` passes (exit 0). Integration tests: not run (see "Integration tests").

Verifier changes: two test additions only (a test row in `EditServiceForm.test.tsx`, a subtest in `serviceInput.test.ts`, and one more subtest in `EditServiceForm.test.tsx`). No source change. Details under "Tests added".

## `make check`

Run on `45dbd4f` after `npm ci` in `frontend/` (a fresh checkout has no `node_modules`; the first run stopped at `eslint: command not found`, which is the missing install, not the code). Result: golangci-lint 0 issues; eslint and stylelint clean; Go tests ok; Vitest 67 files, 1215 tests passed; `tsc -b` and `vite build` ok; `go build` ok; Redocly lint of `docs/openapi.yaml` ok; exit 0. I ran it twice; both passed. `package.json` and `package-lock.json` are unchanged after the install (`git status` clean).

## Acceptance criteria

"Real?" = would the named test fail if the behaviour were removed. "Yes (mutation Mn)" means I removed the behaviour and watched it fail (see "Mutation checks run"). "Yes (read)" means I judged it from the assertions only.

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| 1 | `toFormValues` of a full HTTP service, a TCP service, a service with no `settings` (FR-7, FR-39) | `serviceInput.test.ts`: "gives each text of a full HTTP service…", "gives a true rule…", "gives a TCP service its host and port…", "gives the add timing defaults…", "treats a body with a type and no content…", "keeps the days of a saved certificate check that is off" | Yes (M12, M13) | Met |
| 2 | `toServiceInput(toFormValues(s))` round trip, `{ enabled: false }`, no key of the other type, sparse services | `serviceInput.test.ts`: the four "round-trips…", "sends { enabled: false }…", "gives the add defaults for everything a sparse…" (+ my limits row) | Yes (M12, M13) | Met |
| 3 | `isFormChanged` cases, put back, add defaults | `formChanged.test.ts` (`it.each` of 17 changes, row added and removed and type switched back, add defaults) | Yes for "true" (M4, and end to end in the Edit form tests); the "false again when put back" half of the `it.each` only re-asserts `isFormChanged(initial, initial)`, so it proves nothing by itself. The put-back cases are really proved in `EditServiceForm.test.tsx` "editing and putting everything back…" (Yes, M4) | Met (see N3) |
| 4 | `getService` / `updateService` call GET / PUT with the encoded id | `services.test.ts`: "getService sends one GET for the encoded id…", "updateService sends one PUT…" | Yes (read: asserts method, path and encoded id) | Met |
| 5 | `useService` states, retry, no focus refetch, second mount asks again | `useService.test.tsx`: all six cases | Yes (M8b for "no cached copy kept"; the focus case reads as real). A cache entry seeded by something else is not covered, see N1 | Met |
| 6 | `useUpdateService`: path id, body, `shown_on_public_view`, 200 removes list (exact) and keeps detail, 404 not-found, 409 limit generic, others as create | `useUpdateService.test.tsx`, `useSaveService.test.tsx` (`toFailure by mode`), `useCreateService.test.tsx` unchanged | Yes (M1, M2, M6, M10) | Met |
| 7 | Page: loading | `EditServicePage.test.tsx` "loading: …" | Yes (M9) | Met |
| 8 | Page: load failed, `Try again` disabled in flight, retry 200 shows form | "load failed (a 500)…", "load failed again on a retry keeps the banner" | Yes (M9 breaks them; read for the disabled assertion) | Met |
| 9 | Page: not found (list entry removed, no back link or heading, link to `/`, focus on `h2`) | "not found: replaces the page…" | Yes (read) | Met |
| 10 | Page: session ended renders nothing, ends on sign-in with the notice | `EditServicePage.test.tsx` "session ended…", `App.test.tsx` "a 401 on getService ends on the sign-in form…" (FR-4) | Yes (read) | Met |
| 11 | Routes: `/services/some-id` shows the page; others unchanged; signed-out gate | `App.test.tsx` "signed in: /services/:id shows the edit service page…" + the existing route and gate tests | Yes (read) | Met |
| 12 | Loaded HTTP service: every control at its saved value, Name focused, footer empty (FR-7, FR-39) | `EditServiceForm.test.tsx` "shows the heading, the sub line, a focused Name and every control…" | Yes (M5 mask, M12, M4) | Met |
| 13 | Loaded TCP service | "shows a TCP service with its host and port…" | Yes (M13) | Met |
| 14 | Sub line keeps the loaded name (NFR-7) | "keeps the loaded name in the sub line…" | Yes (read; `subtitle` is `initialValues.name`, and M3 now also checks it) | Met |
| 15 | Save with nothing changed sends saved values and the saved public flag | "with nothing changed sends the saved values and shown_on_public_view %s as loaded" (true and false) | Yes (M1) | Met |
| 16 | Save after edits sends each edit to the id in the address (FR-7, FR-20, FR-65) | "sends each edited value and the rest as loaded…" | Yes (M1, M2) | Met |
| 17 | Change of type both ways (FR-66) | "sends a TCP check and no HTTP key…", "sends the HTTP check when a TCP service is switched…" | Yes (read: `toEqual` on the whole check, `not.toHaveProperty`) | Met |
| 18 | While saving: read-only, disabled, `Saving…` | "is read-only and disabled with Saving… while the request is in flight" (also one request for a second click) | Yes (read) | Met |
| 19 | Success: `/`, list entry gone, `getService` once, toast with the response name, no prompts | "on success goes to /, drops the list…" | Yes (M10 breaks the sibling hook test and the 404 test; this test asserts the `['services']` removal and call counts) | Met |
| 20 | Every failure of the Add table on the edit form, markup as text (NFR-7, NFR-8) | "shows a 422…", "409 service_name_taken…", "413 and 403 csrf_failed…" (`Reload`), `it.each` 500 / network / 409 limit with `Try again` resending the same values | Yes (read: server's own non-default messages, `<b>` checked as text) | Met |
| 21 | `404 not_found` on save: banner, Save disabled, values stay, focus on link, link leaves without asking, Cancel asks | "shows the not-found banner on a 404…", "leaves by Back to services with no question…" | Yes (M6, M7, M11) | Met |
| 22 | `409 service_limit_reached` generic; Enter after the 404 sends nothing; list entry gone | the `it.each` above; the 404 test types `{Enter}` and counts calls | Limit and list entry: Yes (M6, read). **Enter after the 404: could pass without the `gone` check** (M7b survived: jsdom, like a browser, does not submit through Enter when the default button is disabled, so the guard in `onSubmit` is never reached by this test) | Met, see N2 |
| 23 | Leaving: untouched leaves with no question by `Cancel`, back link, brand link, Back; changed asks on each; put back leaves | "leaving (NFR-4)" block: Cancel, back link, browser Back untouched; Cancel and back link changed; "editing and putting everything back…"; unload prompt | Yes (M4). The brand link and browser Back **with a changed form** are not asserted on the Edit form; the guard is shared and its own tests (`useLeaveGuard.test.tsx`, `App.test.tsx`) cover those exits | Partly met, see N4 |
| 24 | `401` on save while changed ends on sign-in, no dialog, no banner (FR-4) | `App.test.tsx` "a 401 on saving a changed edit form…" | Yes (read) | Met |
| 25 | A saved name `<b>x</b>` shows as text in the sub line and the Name input (NFR-7) | "keeps the loaded name in the sub line…" | Yes (read: asserts `.page-sub b` is null) | Met |
| 26 | The Add form is unchanged | `AddServiceForm.test.tsx` passes as it is; `git diff` shows no assertion removed from it | Yes (M4 variant: the Add "put back" case would fail if `isFormChanged` differed from the old rule; it passed with the real code) | Met |
| 27 | `make check` passes | run, exit 0 | n/a | Met |
| 28 | Nothing outside the allowed paths changed; manifests unchanged | `git diff main...HEAD --name-only`: only `frontend/src/**` (inside the task's list) and `docs/tasks/edit-service-screen.plan.md` | n/a | Met |

The task's header for the form tests names `ServiceForm.test.tsx`; no such file exists. Every behaviour it would hold is tested through `EditServiceForm.test.tsx` and `AddServiceForm.test.tsx`, so no criterion depends on it. Report only (N6).

## Plan check

Read after the criteria table, and judged against the task file, not the plan.

- Every acceptance criterion has a plan line. The plan merges criteria 7 to 11 into five lines and criterion 22 into one; nothing is missing.
- Every ticked item names a test that exists. Two ticks claim more than the tests show: "Leaving: … put back leaves" (true end to end, not in the `formChanged` table, see N3) and "Enter after the 404 sends nothing" (the test passes, but not because of the `gone` guard, see N2). The tick "Leaving" also does not mention the brand link or a changed form leaving by browser Back (N4).
- The plan does not list "`ServiceForm.test.tsx`", and says so ("only if needed"). No difference to the diff.
- Differences between the plan and the diff: none found. The files the plan names are the files in the diff. The plan's "judgment calls" are all visible in the code: `markSavedRef` (a ref handed from each wrapper to `ServiceForm`), `could-not-load` from `isFetched` with no data, `refetchOnMount: 'always'` with `staleTime: 0`, `toFormValues` keeping `min_days_left` for a saved `enabled: false` check, `makeRichService` in `fixtures.ts`, `EditServiceForm.test.tsx` rendering the real page. I agree with each; none contradicts the task file.
- The plan notes one `AddServiceForm.test.tsx` case ("shows a name with markup as text in the toast") that failed once under load while typing `h<b`. I did not see it fail in two full runs. Kept as N5.

## Rule checks (by reading the diff)

- **Dependencies:** `package.json` and the lockfile are not in the diff; no new import of a package outside `STACK.md` (new imports are `react`, `react-router`, `@tanstack/react-query`, `react-hook-form`, `lucide-react`, all in use before). No Go change.
- **Allowed paths:** all changed files are in `features/service-form/**`, `pages/EditServicePage*`, `App.tsx`, `App.test.tsx`, `lib/api/services*`, `test/fixtures.ts`. Nothing in `components/**`, `hooks/**`, `app-shell/**`, `styles/**`, `schema.d.ts`, `backend/**`, `e2e/**`, `docs/**` (other than the plan). `features/service-list`, `alert-list`, `sign-in` untouched.
- **Layer and feature boundaries:** `features/service-form/` imports nothing from `app-shell/` or another feature (grepped). The page imports only the feature and `react-router`.
- **One definition of "changed":** `isFormChanged` is the only comparison; `useLeaveGuard` takes a boolean. **Body built once:** `toServiceInput`, used by `useCreateService` and `useUpdateService`; update adds only `shown_on_public_view`. **Inverses:** round trip proven for HTTP, TCP, limits (my row). **Initial values:** read once through `useState(() => toFormValues(service))` and the page's `key={service.id}`; M3 proves it (after the test I added). **Query state derived:** `useService` returns a view computed from `useQuery`, with no component state copy.
- **Classification:** `toFailure` branches on `ApiError.status` and `.code` only, never on text. A `404` with another code, or without a problem body, is the generic failure (`useSaveService.test.tsx`).
- **Contract:** `getService`, `updateService` return `Service` (generated types, no hand-written ones). No status or code beyond "Operations used"; the only 404 handling is `not_found` on `getService` (`useService`) and on `updateService` (`toFailure` with `mode: 'update'`).
- **Components:** no `dangerouslySetInnerHTML`, no `@base-ui` import outside `components/ui/`, no `type="password"`, no ellipsis or truncation on a header value, no literal colour or pixel value in the diff (`service-form.css` and `components.css` are not changed; every class the new states use (`.empty`, `.banner--warn`, `.banner--error`, `.sr-only`, `.page-sub`, `.plain-text`) already exists in `styles/components.css`). Icons are Lucide only (`ArrowLeft`, `CircleAlert`, `RefreshCw`, `WifiOff`, `LoaderCircle`). The saved name, header values, messages and server messages are React text children or input values. No hand-written replacement of a Base UI component was added (the form uses the existing `Select`, `TypeField`, `DiscardDialog` wrappers).
- **Strings:** the curly quotes and the ellipsis are as written in the task (`Loading service…`, `couldn’t`, `can’t`, `“{name}”`). Some strings exist in more than one file (N7).
- **Design copy:** no design reference markup copied; `docs/design/` is not in the diff.
- **Convention "one hook per concern, colocated test":** `useService`, `useSaveService`, `useUpdateService`, `useLeaveGuard` each have a test. `EditLoadStates.tsx` has no file of its own test; its three states are covered by `EditServicePage.test.tsx`.

## Mutation checks run

Each was applied to the source, the named test files were run, and the source was restored (`git status` clean afterwards). All 13 mutations from "Mutation checks to run" were run; two needed follow-up.

| # | Mutation | Result |
|---|---|---|
| M1 | Drop `shown_on_public_view` from the update | Fails: `useUpdateService` ×2, `EditServiceForm` "with nothing changed…" (true and false), "sends each edited value…" |
| M2 | Send to another id (`'other'`) instead of `service.id` | Fails: `useUpdateService` "sends the create body…", `EditServiceForm` ×3 |
| M3 | Read `initialValues` again on every render (`toFormValues(service)` without `useState`) | **Survived at first** (no test refetched while the form was open). I added "keeps the form, the sub line and "unchanged" when a later answer for the service arrives"; with it, M3 fails |
| M4 | Compare "changed" against `ADD_DEFAULT_VALUES` on the Edit form | Fails: 6 tests (untouched leaves, footer, unload prompt, put back, loaded form) |
| M5 | Mask header values (`type="password"` on value inputs, in the shared `NameValueRows`) | Fails: "shows the heading, the sub line… every control at its saved value" |
| M6 | A `404 not_found` on update is the generic failure | Fails: `useSaveService` "update: a 404…", `EditServiceForm` ×2, `useUpdateService` |
| M7 | Enable `Save service` after the 404 | Fails: "shows the not-found banner on a 404, disables Save…" |
| M7b | Remove the `gone` check from `onSubmit` (Enter after the 404) | **Survived** (equivalent in jsdom; see N2) |
| M8 | Cached service as the form's start (`initialData` from the cache) | Survived: the tests never seed `['services', id]`, so the mutation changed nothing observable. Followed up as M8b and the experiment below |
| M8b | `gcTime: 60000` | Fails: `useService` "asks the server again on a second mount and keeps nothing after the page closes" |
| M8c | `staleTime: 60000` | Survived; equivalent while `gcTime: 0` and `refetchOnMount: 'always'` are set (the observer refetches on mount either way) |
| M9 | Show the form while loading | Fails: all 5 `EditServicePage` state tests |
| M10 | Removal of the list without `exact` (also removes the mounted `['services', id]`) | Fails: `useUpdateService` "on 200 removes the list entry, keeps the detail entry…", `EditServiceForm` "leaves by Back to services…" |
| M11 | Drop `LEAVE_WITHOUT_ASKING` from the not-found link | Fails: "leaves by Back to services with no question even when changed…" |
| M12 | A `false` rule read back as kind `text` | Fails: 4 tests in `serviceInput.test.ts` and `EditServiceForm.test.tsx` |
| M13 | Leave the TCP values out of `toFormValues` | Fails: 4 tests in `serviceInput.test.ts` and `EditServiceForm.test.tsx` |

Experiment (not committed, it fails on the current code): seed `client.setQueryData(serviceQueryKey('0190-abc'), …)` with a stale service, make `getService` pending, render `EditServicePage`. The page shows the **form built from the seeded copy**, not `Loading service…`. See N1.

## Inputs tried (task file's list)

- 20 headers + 20 query rows + 10 rules (strings and booleans) + 64 KB body + a name with spaces and a header value with spaces, markup, `&` and quotes: round trip through `toFormValues` and `toServiceInput` is exact (new subtest, passes). A render of that size was not run in the DOM.
- A TCP service switched to HTTP and back, a row added and removed, `'30 '` retyped: footer returns to empty (existing test, M4 shows it is real).
- A service deleted between load and save: the `404` path (criterion 21).
- A `422` on a field of the other type (`check.port` while the form shows HTTP): shown in the summary as text, and gone after switching the type (new test, passes).
- Saving twice quickly: one request (`useSaveService` "sends once for two submits in the same tick", and the "while saving" form test).
- Leaving by every exit after editing and after putting everything back: Cancel, back link, browser Back covered on the Edit form; brand link and Sign out only through the shared guard tests (N4).
- Boundary of each limit: the form's limits (timing values, port, name) are the Add form's shared code and are tested there; the Edit form adds none. Not re-tested.
- Concurrent writes: not applicable on the client beyond the in-flight guard; the server's behaviour for two tabs is the documented known gap.

## Integration tests

Not run. This task changes no Go code and no Go test; there is no integration test that exercises it (`make test-integration` covers Go packages with the `integration` tag, such as the mailer against Mailpit). The Docker daemon is also not running in this session, so the command could not start anyway. No criterion depends only on an integration test; all are Vitest tests. The builder's "not run" is consistent with that.

## What I could not prove

The layout at 360 px and the focus outline in a browser (no browser run; the app was not started), and a real server's answers to `getService` and `updateService` (every request here is a mock at the wrapper boundary). The `Edit` row of "Narrow screens (NFR-3)" and "Browsers (NFR-2)" in `docs/manual-checks.md` stay with the user.

## Findings

### Blocking

None.

### Non-blocking

**N1. A cached `['services', id]` entry fills the form (latent bug).** `useService` relies on `gcTime: 0` to keep nothing, but if the key holds data when the page mounts, `refetchOnMount: 'always'` shows that data at once as `loaded` and refetches in the background; the form then starts from the stale copy and the fresh answer never rewrites it (by design). The task says "no cached copy fills the form". Reproduce: the experiment above. Nothing in the app writes that key today, so no user can reach it.
Matters when: another task seeds or prefetches `['services', id]` (a hover prefetch from `service-name-link`, or `service-test-panel` caching the detail), or React Strict Mode remounts the page before the zero-time garbage collection.
A fix would make `loaded` require an answer fetched after mount (for example `query.isFetching && query.data` counts as `loading` on first mount), plus a test that seeds the key.

**N2. The `gone` check in `onSubmit` is not covered (test quality).** M7b: removing `if (saving || gone) return` leaves all tests green, because the disabled default button already blocks Enter in jsdom (and in browsers). The task file says "a disabled button does not stop Enter", which is not what the HTML specification says for a disabled default submit button. The guard is harmless.
Matters when: the footer's submit button moves outside the `<form>` or is replaced by an enabled control, so Enter would reach `onSubmit`.

**N3. The "false again when put back" half of the `isFormChanged` table is vacuous (test quality).** It asserts `isFormChanged(initial, initial)` after each case. Real put-back coverage is in `EditServiceForm.test.tsx`.
Matters when: `isFormChanged` gains a cache or memo keyed on the previous result.

**N4. Brand link and browser Back with a changed Edit form are not asserted on the Edit form (test quality).** Covered for the shared guard (`useLeaveGuard.test.tsx`, `App.test.tsx`), and untouched-form exits are tested on the Edit form.
Matters when: the guard's wiring inside `ServiceForm` changes (for example `changed` is passed differently on one screen).

**N5. A flaky Add test under load (test quality, builder's note).** "shows a name with markup as text in the toast" in `AddServiceForm.test.tsx` once typed `h<b` incompletely during a parallel run. Not reproduced in two full runs. Report only: no trigger beyond a loaded CI runner.

**N6. No `ServiceForm.test.tsx` (test quality).** Report only; every behaviour is covered through the two wrapper test files.

**N7. Strings repeated across files (cosmetic).** `Something went wrong.` / `The server couldn’t be reached or returned an error.` exist in `EditLoadStates.tsx`, `FormBanners.tsx`, `AlertListBanners.tsx` and `TargetDialogBanners.tsx`; `This service no longer exists` in `EditLoadStates.tsx`, `FormBanners.tsx` and `AlertList.tsx`; the task chose to copy them from the alert list. Report only.
Matters when: someone rewords one of them and not the others (report only until then).

### Tests added by the verifier

- `EditServiceForm.test.tsx`: "keeps the form, the sub line and "unchanged" when a later answer for the service arrives" (kills M3); "shows a 422 on a field of the other type in the summary, and drops it when the type is switched".
- `serviceInput.test.ts`: "round-trips the limits as typed: 20 headers and 20 query rows, 10 rules, a 64 KB body, spaces and markup kept".

`make check` was run on the builder's commit before my additions; after them I ran eslint, `tsc -b` and both test files (27 and 11 tests, all passing). Final full `make check` on this branch (with the additions): exit 0, 67 files, 1218 tests passed.

## Docs or specs that no longer match

- **`docs/design/README.md`, "Additions that are built":** the Edit screen adds states that are not drawn: the loading state (back link, heading, `Loading service…`), the load-failed banner, and the page-replacing "This service no longer exists" block, plus the texts `Service “{name}” saved.` and `Service “{name}” added.`. The task file lists them; the README does not.
- **`docs/openapi.yaml`, `docs/requirements.md`:** no change needed. The contract is used as written; no code or status beyond it is handled.
- **`STACK.md`:** no version adopted by this task (no dependency changed).
- **`docs/tasks/backlog.md`:** nothing to remove for this task; N1 is a candidate loose end ("`edit-service-screen`: a cached `['services', id]` fills the form. Matters when: another task seeds that key.").
- **`docs/manual-checks.md`:** the "Edit it." line (Browsers, Narrow screens) is still unticked and now has a screen to run against.
