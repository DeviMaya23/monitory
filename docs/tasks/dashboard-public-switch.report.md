# Verification report: dashboard public page switch

Verifier branch: `verify/dashboard-public-switch` (built on the builder's `feat/dashboard-public-switch` at `1fba00f`). No source file was changed; two test files were tightened (see "Findings").

**Verdict: no Blocking findings.** `make check` passes (exit 0). Integration tests: not run, the task is frontend only and touches no code that has them.

## 1. `make check`

- First run on the builder's commit: exit 1. Two 5 s timeouts, in `App.test.tsx` ("after a visit to the dashboard, the 201 drops the cached list…") and `AddServiceForm.test.tsx` ("sends PATCH when PATCH is chosen"). The machine load average was 15 to 20 (sibling sessions; the AddServiceForm file alone took 190 s). Both files, run alone, passed: 272 of 272 tests.
- Second full run, with my test edits: exit 0, lint, openapi-lint, 1351 frontend tests, Go tests, build all green.
- The timeouts touch no file of this task; see finding N2.

## 2. Acceptance criteria

"Real?" means the named test fails if the behaviour is removed. "Yes (mutation M…)" means I broke the source and watched it fail; section 5 lists the mutations.

| # | Criterion | Test | Real? | Met? |
|---|---|---|---|---|
| 1 | `getPublicViewSettings` GETs `/api/settings/public-view`, `updatePublicViewSettings({enabled:true})` PUTs `{"enabled":true}` (FR-26) | `publicView.test.ts` (both cases, assert path, method, body) | Yes, asserts the exact path, method and body string | Met |
| 2 | State: loading, on, off, 500 and `TypeError` give not-loaded, failed refetch keeps `on`, refresh recovers | `usePublicView.test.tsx` "state (FR-26)" | Yes. Reading `query.isFetched`/`data` is the only source of the state; each branch is asserted | Met |
| 3 | `toggle(true)` sends exactly `{enabled:true}` once; two calls in one tick send one | `usePublicView.test.tsx` "sends exactly…" | Yes (M1, M2, M5) | Met |
| 4 | Success replaces the cache with the answer (opposite-answer mock) and toasts by the answer | `usePublicView.test.tsx` "shows the answer, not the asked value…" | Yes (M3, M12) | Met |
| 5 | Each failure of the table gives its toast and keeps the value; 404 is the generic toast; 401 no toast | `usePublicView.test.tsx` 403 case, the `it.each` (400, 404, 422, 500, network), "a 401 shows no toast" | Yes (M10, M11, M17) | Met |
| 6 | Toolbar order and Tab order `Add service`, `Refresh`, switch, `Open public page (new tab)`; Space toggles (NFR-4) | `ServiceList.test.tsx` "has the toolbar order…"; `PublicToggle.test.tsx` "asks for the opposite value, with a click and with Space" | Yes. Real `user.tab()` walk; the DOM order list fails if the markup is reordered | Met |
| 7 | Loading and not loaded: disabled, unchecked, no word; link shown with `href`, `target`, `rel`; no banner or toast; enabled with its word after the load (FR-26) | `PublicToggle.test.tsx` (loading, not-loaded); `ServiceList.test.tsx` "is disabled, unchecked and wordless while loading…", "stays disabled and wordless when the setting could not be loaded…" | Yes (M7, M14) | Met |
| 8 | On is checked with `On`; Off is unchecked with `Off`; same link in both (FR-26, FR-28) | `PublicToggle.test.tsx` "when the setting is on/off"; `ServiceList.test.tsx` `it.each` | Yes (M8) | Met |
| 9 | Turn on from Off: sends `{enabled:true}`, pending shows Off and has no `disabled`, second click sends nothing, answer shows On and the toast; off toast | `ServiceList.test.tsx` "turns on from Off…", "turns off from On…" | Yes for send, value, second click, toast (M1, M4, M5). **The "no `disabled`" part was not real as written**, see N1; fixed here (M6) | Met |
| 10 | 403 shows the shared toast, Reload reloads once, value kept (NFR-8); 500 toast on and off; second try sends again | `ServiceList.test.tsx` "a 403 csrf_failed…", "a 500 shows…", "a failure while turning off says off" | Yes (M17, M10) | Met |
| 11 | No `disabled` while pending; focus on the switch after the answer | `ServiceList.test.tsx` "turns on from Off…" | `disabled` part: not real until my added `aria-disabled` assertion (M6). Focus part: cannot fail, focus never leaves the switch (the task admits this; N3) | Met (after fix) |
| 12 | A pending refetch cannot overwrite the answer | `usePublicView.test.tsx` and `ServiceList.test.tsx` "…cannot overwrite the answer" | **Not real as written**: removing `cancelQueries` (M13) failed nothing. Fixed here: both now fail under M13 | Met (after fix) |
| 13 | `Refresh` and `Retry` call both requests; auto refresh does both; Refresh busy follows the list only | `ServiceList.test.tsx` "Refresh and Retry fetch…", "the automatic refresh fetches…"; `usePublicView.test.tsx` "refetches after the interval" | Yes (M9, M18). Busy state: the test keeps the setting pending and requires Refresh enabled | Met |
| 14 | No refetch of the setting after a successful toggle | `usePublicView.test.tsx` and `ServiceList.test.tsx` (`getPublicViewSettings` called once) | Yes (M12 turns it into an invalidate-refetch and fails) | Met |
| 15 | Real route in `App.test.tsx`: control shows and toggle works; 401 on the GET (refresh) and on the PUT ends on sign-in with the notice and no toast | `App.test.tsx` "The dashboard's public page switch (FR-26)" (3 cases) | Yes: each calls the registered handler first, then rejects, and checks the form, notice and absent toast | Met |
| 16 | `useServiceList` reads `servicesQueryKey`; no `SERVICES_KEY`; `SessionProvider.test.tsx` and `App.test.tsx` unchanged on that | `useServiceList.test.tsx` "the list key"; `grep SERVICES_KEY frontend/src` is empty | Yes (M16: 12 failures across three files) | Met |
| 17 | `Switch` `hideState`: word empty for both values, element kept; default unchanged | `Switch.test.tsx` new case plus the existing cases | Yes for the word and element. Dropping the prop in `PublicToggle` fails (M7) | Met |
| 18 | `make check` passes | run twice, see section 1 | n/a | Met |
| 19 | Nothing outside the allowed paths; `package.json` and lockfile unchanged | `git diff main...HEAD --name-only`: 15 frontend files plus the plan; `package.json` diff is 0 lines | n/a | Met |

Requirement IDs: FR-26 (rows 1 to 5, 7 to 10), FR-28 in part (8), FR-95 in part (13), NFR-4 in part (6), NFR-8 (10). All are met.

## 3. Plan check

Read after sections 1 and 2. `docs/tasks/dashboard-public-switch.plan.md`:

- Every task criterion appears in the plan; none is missing. The plan adds a CSS item (read only), which is fine.
- Ticked items whose test does not check the behaviour:
  - "No `disabled` while pending" is ticked. The plan itself records that the switch is a `span role="switch"`, so `not.toHaveAttribute('disabled')` can never fail. The plan did not draw the conclusion that the test is empty. Fixed here (N1).
  - "A pending setting refetch cannot overwrite a toggle's answer" is ticked, and the test passed with the protection removed (N1).
- Differences between plan and diff: none found. The `Open` link markup (space as its own text node), `hideState` rendering an empty element, and the Retry button using the combined refresh all match the plan's judgment calls and the diff.
- The plan says the second `make check` passed; mine passed on the second run too, after one load timeout in the first, as it says.

## 4. Rule checks

- **Dependencies:** `package.json` and the lockfile are unchanged. Installed versions in use: `@base-ui/react` 1.9.0, `@tanstack/react-query` 5.107.1, `lucide-react` 1.73.0, all already pinned. Nothing was added.
- **Layering:** `features/service-list/` imports no `app-shell/` and no other feature. The setting's key is in `lib/api/publicView.ts` (`['public-view-settings']`), outside `['services']`. Base UI is imported only in `components/ui/Switch.tsx`. No `dangerouslySetInnerHTML`.
- **`usePublicView.ts` by reading:** the body is `{ enabled }` from the boolean passed in, never `{}` and not server data. The cache is replaced by the answer after `cancelQueries`. Classification goes through `toOutcome` (status and code, never text). The in-flight guard is a ref. The switch gets no `disabled` during a request. A 401 shows no toast. The 404 is the generic toast.
- **Components:** the word is hidden only through `hideState`. The link is an `a` with `target="_blank"`, `rel="noopener noreferrer"`, Lucide `ExternalLink`, name `Open public page (new tab)`. Strings appear once, with curly quotes. The shared `Switch` is used; nothing hand-written. No design markup copied.
- **CSS by reading:** `.dash-toolbar__spacer`, `.public-toggle*` and the 640 px block match `docs/design/dashboard.css` line for line (the `5px` and `36px` are the board's values), plus the allowed `.public-toggle .switch-row { min-height: 0 }`. Wide: the spacer is `flex: 1` after `Meta`, so the box sits at the right end. At or below 640 px: the spacer is hidden, the box is `width: 100%` at `--control-h-touch`, the link has `margin-left: auto`, and `.refresh-meta` has `order: 5` so it comes after the box. Not checked in a browser.
- **Contract:** request and response are the generated `PublicViewSettings`; no status or code beyond the task's table.

## 5. Mutation checks run

Each mutation was applied to the source, the named files were run, then it was reverted (`git status` clean for source afterwards).

| Mutation | Result |
|---|---|
| M1 send `{}` | fails 3 (usePublicView, ServiceList x2) |
| M2 send the old value | fails 3 |
| M3 toast by the typed value, not the answer | fails 3 |
| M4 optimistic cache write on toggle | fails 12 |
| M5 drop the in-flight guard | fails 2 (hook, ServiceList) |
| M6 switch disabled during the request | passed the builder's test; fails with my added `aria-disabled` assertion |
| M7 show the word while loading | fails 4 |
| M8 hide the link while Off | fails 4 |
| M9 `Refresh` skips the setting | fails 3 |
| M10 a 404 gives the "already deleted" toast | fails 1 (the 404 row) |
| M11 toast on a 401 | fails 1 |
| M12 `invalidateQueries` instead of `setQueryData` | fails 7 |
| M13 drop `cancelQueries` | **survived** the builder's tests; fails 2 after my change |
| M14 drop `rel` | fails 3 |
| M16 list key changed | fails 12 |
| M17 `Reload` action dropped from the CSRF toast | fails 2 |
| M18 `refetchInterval` dropped | fails 2 |

## 6. Cases beyond the task file, and the live run

- Boundary and sequence cases already in the tests, confirmed by the mutations above: two toggles in one tick, a slow request with a Refresh in the middle, a failure then a success, the setting loading after the list, a 403 then a 500.
- I also tried against a **real server** (built binary, new SQLite file, signed in with `curl`): `GET` gives `{"enabled":false}` by default; `PUT {"enabled":true}` gives 200 and `true`; `PUT false` gives 200 and `false`; `PUT {}` gives 200 and `false` (read as off, as the task says, and why the switch never sends it); a `PUT` with no token and with a wrong token gives `403 csrf_failed`; `{"enabled":"yes"}` gives `400 malformed_request`. This matches what the hook assumes.
- **Run, not driven:** I started the real binary, but did not drive the dashboard in a browser. The look at 360 px, the focus outline and the wide-screen placement are unproven (by reading the CSS only). The task says a real server's answers and the 360 px look cannot be proven by the verifier; the first is now checked with `curl` above.
- `GET /api/public/dashboard` answers `501` on this base (the backend of the public view is not merged), while `/status` serves the app page. See N4.

## 7. Integration tests

`make test-integration` not run: the task changes only `frontend/src/**` (and a plan file), no code with integration tests. No criterion depends only on integration tests. Database version: none.

## 8. Findings

### Blocking

None.

### Non-blocking

**N1. Two criteria tested nothing (test quality). Fixed here.**
- The "no `disabled` attribute while pending" assertion could not fail: the Base UI switch is a `span role="switch"` and uses `aria-disabled`, so the `disabled` attribute never exists. A switch disabled during the request passed the test (M6).
- The "refetch cannot overwrite the answer" tests asserted before the late response had landed, so removing `cancelQueries` passed (M13). I checked in a throwaway test that, with this library version (5.107.1), a pending fetch really does overwrite `setQueryData`, so the call is needed.
- Fix, in the existing test files: `ServiceList.test.tsx` gains `expect(control()).not.toHaveAttribute('aria-disabled', 'true')` while pending, and waits 100 ms of fake time before checking the value in the overwrite case; `usePublicView.test.tsx` waits for `fetchStatus` to be idle and checks the cached value. Both fail under the mutations and pass on the real code.
- Matters when: someone later disables the switch during a request or removes `cancelQueries` while cleaning up the hook.

**N2. Two timeouts under load (test quality, report only).** `App.test.tsx` and `AddServiceForm.test.tsx` use the 5 s default and time out when the machine is saturated (load 15 to 20 here; the builder saw the same). They passed alone. Matters when: CI runs on a loaded or slow runner, then a red build with no cause.

**N3. The focus assertion is weak (test quality).** The test focuses the switch before the request and checks focus after the answer. Focus never leaves in between, so it only fails if the switch is remounted. The task acknowledges that focus cannot be proven in jsdom; the `aria-disabled` assertion from N1 is the real proof. Matters when: the switch or its row is given a changing `key` or otherwise remounts on the answer (the focus check then does fail, which is the point).

**N4. The `Open` link leads to a page whose API is not built (UX, decision needed).** On this base `GET /api/public/dashboard` is `501`. The link and the `/status` page are in place (`public-dashboard-screen`), but a click shows an error state until the backend of the public view merges (`backlog.md`, milestone 4). Matters when: the user runs the app, or merges this before that backend task, and clicks `Open`.

## 9. Docs or specs that no longer match

- `docs/tasks/backlog.md`: the loose-end line about `SERVICES_KEY` duplicating `servicesQueryKey` (mentioned in `dashboard-pause-resume.report.md`) is closed by this task and can be dropped. I found no remaining `SERVICES_KEY` in `frontend/src`; older task and report files still name it as history.
- `docs/design/README.md`: "Additions that are built" does not list the switch states the board does not draw: the `Public page` switch disabled and without a word while the setting loads or could not load, and the success and failure toasts of the toggle. Add them so a later reviewer does not take them for an unlisted state.
- `STACK.md`: no new library; no version adopted. Versions in use are listed in section 4.
- `docs/openapi.yaml`, `docs/requirements.md`: still match (FR-26, FR-28, FR-95 behave as written); the contract was not changed.
- `docs/manual-checks.md`: no section is made due by this merge alone. The public page itself needs the backend (N4).
