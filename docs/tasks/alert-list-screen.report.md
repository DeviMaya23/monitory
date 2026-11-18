# Verification report: alert list screen

Branch: `verify/alert-list-screen` (based on `feat/alert-list-screen` at `c765be6`).
Result: **1 Blocking finding** (`make check` fails, caused by `main`, not by this diff). No pull request opened.

## 1. `make check`

`make check` stops at `lint-backend`. I then ran every step on its own:

| Step | Result |
|---|---|
| `make lint-backend` | **failed**: `internal/handler/target_mapping.go:56-69` does not compile against the regenerated `internal/api/api.gen.go` (`api.Target` has no `Id`, `LastDeliveryFailed`, `FromWebhookTargetInput`; `api.Webhook`, `api.Email` undefined) |
| `make test-backend` | **failed**: `monitory/internal/handler [build failed]`, same cause. All other Go packages pass |
| `make lint-frontend` (after `npm ci`) | passed |
| `make lint-css` | passed |
| `make test-frontend` | passed: 26 files, 389 tests (391 after the two tests I added, see below) |
| `make build-frontend` (`tsc -b` and `vite build`) | passed |
| `make openapi-lint` | passed |

Where the failure comes from: `git diff origin/main HEAD -- backend` is empty, so `main` fails the same way. The contract fix `9002110` ("update openapi target shape") regenerated `api.gen.go`, but `handler/target_mapping.go`, which came in with `targets-api`, was never adapted to the new union types. The plan already reports this.

## 2. Acceptance criteria

"Real?" says whether the test would fail if the behavior were removed. "Yes (mut.)" means I broke the code and the test failed (section 5).

### `lib/api/targets.ts`

| Criterion | Test | Real? | Verdict |
|---|---|---|---|
| `listTargets` calls GET once and returns the value; `deleteTarget` calls DELETE and resolves to `undefined`; ids encoded in both positions; rejection passes through (NFR-8) | `targets.test.ts`: `listTargets` > calls GET once…, encodes the service id, lets a rejection reach the caller; `deleteTarget` > calls DELETE…, encodes both ids, lets a rejection… | Yes (mut.: unencoded `targetId` fails "encodes both ids") | Met |
| `targetsQueryKey` does not start with `'services'` | `targetsQueryKey` > does not start with the services key | Yes (mut.) | Met |

### `useTargetList`

| Criterion | Test | Real? | Verdict |
|---|---|---|---|
| loading / list / empty / 500 and `TypeError` without data → could-not-load / 404 `not_found` → not-found, also with cached data / 404 other code → could-not-load | `useTargetList.test.tsx` > state (5 tests, one `it.each`) | Yes (mut.: letting cached data beat 404 fails the "even when data was cached" test) | Met |
| A failed reload with data keeps `list`, `refreshFailed` true; `refresh()` clears it | > a failed reload > keeps the list and sets refreshFailed… | Yes: `refreshFailed` is computed from `isError`, and the test asserts both transitions | Met |

### `useRemoveTarget`

| Criterion | Test | Real? | Verdict |
|---|---|---|---|
| ask / cancel / replace / ask in flight no-op; confirm once with right ids, in flight until settled, second confirm sends nothing (FR-16) | `asking and sending` (4 tests) | Yes (mut.: dropping the in-flight guards of `ask` and of `confirm` fails them) | Met |
| 204: exactly that target removed, others in order, `dataUpdatedAt` kept, no `listTargets`, toast, asked id null | `a 204` > removes exactly that target… | Yes (mut.: dropping `updatedAt` fails). Others "keep their objects": the plan says structural sharing clones the element after the removed one, so the test compares by content. A named difference; it follows TanStack, not a bug | Met (partly weaker than written, see plan check) |
| In-flight reload cancelled | `a 204` > cancels a reload that started before… | Yes (mut.: removing `cancelQueries` fails it) | Met |
| 404 `not_found`: removal, one more `listTargets`, error toast | `a 404 not_found` > removes the target, fetches the list once more… | Yes (mut.: dropping the refetch fails 4 tests) | Met |
| 403 `csrf_failed`: cache unchanged, toast, `Reload` calls `window.location.reload` once (NFR-8) | `a 403 csrf_failed` > keeps the cache and offers Reload | Yes (mut.: csrf mapped to the generic failure fails it and the screen test) | Met |
| 500, `TypeError`, 403 other code, 404 without body, 404 other code → generic toast, cache unchanged, id cleared | `other failures` (`it.each`) | Yes: each row must hit the fallback; a mapping that sent any of them to csrf or already-removed would change toast or cache | Met |
| 401: no toast, id cleared | `a 401 unauthenticated` | Yes (mut.: toasting on 401 fails it) | Met |
| No cached list: a 204 creates none; unmount then 204 still removes and toasts | `a 204` > creates no list…, still removes and toasts when the page unmounted… | Yes: the cache change and toast live in the mutation options. I read them there; I did not break them by mutation | Met |

### The screen (`AlertList.test.tsx`, plus `App.test.tsx`)

| Criterion | Test | Real? | Verdict |
|---|---|---|---|
| Loading: status, three hidden skeleton rows, title gains the name, back link to `/` | `loading` > shows a status… | Yes | Met |
| List of three (named email, unnamed webhook, long name and URL): order, sub line, type text, chip, fallback, full long text; `1 target` (FR-17, FR-80, FR-81) | `the list` > shows rows in server order…, says 1 target for one | Yes: asserts text and `textContent` equality | Met |
| `<b>x</b>` and `<i>y</i>` as text, no `b` or `i` (NFR-7) | `renders names and the service name as text, not HTML` | Yes (checks `document.querySelector('b, i')` is null) | Met |
| Empty: heading, text, no button, `No targets · …` | `empty` > shows the heading, the text… | Yes | Met |
| Alerts off: banner and `Edit service` link over list and empty; absent for true, absent field, unknown service, unloaded list | `alerts off` (2 tests) | Yes (mut.: showing it without data fails) | Met |
| Something went wrong: 500 shows banner and no list; Try again disabled in flight then shows list; failed reload keeps rows | `something went wrong` (3 tests) | Yes (mut.: enabled Try again fails; the reload-with-rows case runs only through the 404-refetch path, see non-blocking 1) | Met |
| Service not found: 404 replaces page, link to `/`, no back link or title, `h2` focused; 404 on a reload with rows does the same | `service not found` > replaces…; `after a 404 not_found` > shows service not found… | Yes (mut.: removing the `h2` focus fails both) | Met |
| Only `listTargets` decides not found | `the list` > shows the targets with no name in the title when the service list lacks the service… | Yes | Met |
| `listTargets` uses the id from the address | `asks for the targets of the service in the address` and `App.test.tsx` (id `0190-abc`) | Yes (mut.: hard-coded `'s1'` is caught only by `App.test.tsx`; the screen test alone uses `s1`, the same value) | Met |
| One `Remove {name or address}` per row; no Add, Edit button or link | `has one Remove button per row and no Add target…` | Yes | Met |
| `Remove` opens the group in that row only, focus on the confirming `Remove`, nothing sent; second row closes the first; Cancel and Esc restore, focus back, nothing sent (NFR-4) | `removing a target` > opens the question…, closes the first question…, Cancel and Esc restore… | Yes (mut.: removing the focus move fails 2 tests). The Esc path is covered; mutating only the row's Esc guard survives because `cancel()` has its own guard (section 5) | Met |
| Pending state: Cancel disabled, `Removing…`, `aria-busy`, `aria-disabled`, focus kept, others disabled, Esc / second click / Enter send nothing | `while pending: …` | Yes (mut.: Cancel enabled, other Removes enabled each fail it; both-layer guard mutations fail it) | Met |
| Both banners: order; with no data only the first | `keeps the rows under the banner…`, `shows only Something went wrong with no data…` | Yes (mut.: banner removed fails 3 tests) | Met |
| Spaces-only name shows `Unnamed webhook`, button named after the URL | `shows an unnamed email…` | Yes (mut.: removing `trim()` fails it) | Met |
| After 204: row gone, order, new count, toast, focus on next row; last of three → `h1`; only target → empty and `h1` | `after a 204` (`it.each` of first and middle row, last row, only target) | Yes (mut.: focus to the title always fails 3 tests) | Met |
| After 404: same with its toast; refetch 404 → "service not found" with `h2` focused | `after a 404 not_found` (2 tests) | Yes | Met |
| After 403, 500, network error: buttons back, rows kept, toast, focus on that row's `Remove`; `Reload` only for 403 | `after a failure` (`it.each`, 3 rows) | Yes | Met |
| 401: sign-in form via the shell, no toast, cached list not shown | `a 401 shows the sign-in form…` | Yes (mut.: toasting on 401 fails it) | Met |

### The dashboard

| Criterion | Test | Real? | Verdict |
|---|---|---|---|
| Every row has `Alerts {name}` link to `/services/{id}/alerts`, before Delete, paused and TCP rows too, `aria-hidden` `.btn__label`, link not button, encoded slash | `ServiceList.test.tsx` > A row > every row has an Alerts link…; List > has one Delete button per row… | Yes (mut.: unencoded id and changed `aria-label` both fail) | Met |
| Delivery link `Alert delivery failed – view alert list` to the same address; none without the flag | `A row` > shows Alert delivery failed – view alert list as a link… | Yes | Met |
| Route renders `AlertListPage` and the Alerts link navigates there | `App.test.tsx`: two new tests, placeholder case removed from `placeholderRoutes` | Yes (mut.: hard-coded id fails both) | Met |
| Tests changed on purpose are changed as described (title reworded, link lists, placeholder list) | diff of `ServiceList.test.tsx`, `App.test.tsx` | The only loosening is the one the task allows; the Pause / Resume / Edit / switch / Open-link assertions are kept | Met |

### Repo-wide

| Criterion | Evidence | Verdict |
|---|---|---|
| `make check` passes | fails at `lint-backend` and `test-backend` (section 1), cause on `main` | **Not met** (Blocking 1) |
| Nothing outside the allowed paths; `package.json` and lockfile unchanged | `git diff --name-only origin/main...HEAD`: only `frontend/src/**` and `docs/tasks/alert-list-screen.plan.md`; no change to either manifest | Met |

## 3. Plan check (`alert-list-screen.plan.md`, read after the above)

- Every criterion group in the task file has a plan item. Nothing is missing from the plan.
- Every ticked item has the test it names, and each test checks the behavior (mutations above).
- The unticked `make check` item matches what I found; the plan states the cause and that `backend/` was untouched.
- Plan versus diff: the plan's judgment calls match the diff (`closed` value, un-awaited refetch, `.alerts-banners:empty`, query key `['alert-targets', id]`, `EmailTarget` and `WebhookTarget` exported from `targets.ts`).
- Two differences from the task file that the plan names: "others keep their objects" is asserted by content, not identity; the "failed reload with rows" and "both banners" criteria share one test. Both are acceptable, see Non-blocking 1.
- The plan says "no integration test applies"; I agree (no backend code in the diff).

## 4. Rule checks (by reading the diff)

- **Dependencies:** none added. `@tanstack/react-query` 5.107.1, `lucide-react` 1.73.0, `@base-ui/react` 1.9.0 and `react-router` 8.5.1 are what `package.json` already pinned; the file is unchanged. Nothing imports Base UI outside `components/ui/`. No `eslint-disable` or `stylelint-disable`.
- **Role and paths (ROLES.md):** only `frontend/src/**` and the plan file changed. `components/ui/*`, `schema.d.ts` and the contract are untouched.
- **Layer boundaries:** `features/alert-list` imports nothing from `features/service-list`; only `pages/AlertListPage.tsx` does. API calls go through `lib/api/targets.ts` and `apiRequest`.
- **Data scoping (FR-18):** both wrappers take the service id from the route; the query key includes it.
- **CONVENTIONS "Frontend":** server data stays in TanStack Query (askedId and closed are UI state only); no raw setters returned by the hooks; one hook per concern with a colocated test; no `dangerouslySetInnerHTML`; names and addresses are text children, in `aria-label` too; no hand-written dialog, toast or menu; icons are Lucide only; outcomes chosen by `ApiError.status` and `.code`, never by message.
- **`useRemoveTarget.ts` (task's check):** `cancelQueries`, then `setQueryData` with `updatedAt: dataUpdatedAt`; no refetch on 204; `not_found` refetches once; toasts and cache change are in the mutation's `onSuccess` and `onError`, not in a `mutate` callback; 401 returns silently; checked in the task's order.
- **`useTargetList.ts`:** key starts `'alert-targets'`; no `refetchInterval`; `404 not_found` wins over cached data; `retry: false`.
- **Keyboard:** group focus goes to the confirming `Remove` (effect on `asking`); Esc is handled on the group and does nothing in flight; `Cancel` and other rows use `disabled`, the confirming button `aria-disabled`; the Alerts link is an `a` before Delete; `h1` and not-found `h2` have `tabindex=-1`.
- **Wording:** each screen-specific string appears once outside tests (`Unnamed email/webhook`, `Remove this target?`, `Target removed.`, banner texts); curly apostrophes, en dash and `…` as written.
- **CSS:** `alert-list.css` uses tokens; the px values that remain (28 px square, `6px`, the 640 px block) are copied from `alerts.css`. `overflow-wrap: anywhere` is on name and address; the 640 px block stacks actions and confirmation (`grid-column: 1 / -1`). `.svc__delivery` follows the board. The `!important` colour is copied from `dashboard.css`. The skeleton's inline `width`/`height` copies the board's inline style. The `Actions` column keeps its 132 px.
- **Design reference:** no board markup or component code was copied; I compared the markup.

## 5. Mutation checks run

Each one: break the source, run the named tests, confirm a failure, revert with `git checkout`.

| Mutation | Tests that failed |
|---|---|
| `useRemoveTarget`: remove `cancelQueries` | cancels a reload that started before |
| drop `updatedAt` | removes exactly that target, keeps the rest and the load time |
| 403 `csrf_failed` mapped to the generic failure | hook csrf test, screen 403 row |
| drop the refetch after 404 | 4 tests (hook, 2 screen, both-banners) |
| toast on 401 | hook 401 test, screen 401 test |
| `useTargetList`: cached data beats 404 | not-found even when data was cached |
| `targets.ts`: `targetId` not encoded | encodes both ids |
| `targets.ts`: key `['services', …]` | does not start with the services key |
| `AlertList`: alerts banner without data | shows only Something went wrong with no data |
| `TargetRow`: Esc cancels while removing (row guard only) | **survived**: `cancel()` has the same guard. Row guard and hook guard both removed: 2 tests fail. Defense in depth, not a gap |
| `TargetRow`: Cancel not disabled / other Removes enabled | pending-state test |
| `AlertList`: focus the title instead of the next row | 3 tests |
| `TargetRow`: no focus move to the confirming `Remove` | 2 tests |
| `TargetRow`: no `trim()` on the name | spaces-only name test |
| `ServiceRow`: id not encoded; `aria-label` changed | Alerts link test (1 and 3 tests) |
| `AlertListPage`: id hard-coded | 2 `App.test.tsx` tests |
| `AlertList`: not-found `h2` not focused | 2 tests |
| `AlertListBanners`: Try again not disabled; failure banner removed | Try again test; 3 banner tests |
| double-confirm guards (row and hook) removed | confirm sends once, pending-state test |
| `ask` in-flight guard removed | confirm sends once… |

## 6. Cases tried beyond the task file

I added two tests to the existing `AlertList.test.tsx`; both pass without a source change:

- Five targets (the most the server sends) and a 2,048-character URL: the sub line says `5 targets`, five rows, the address is in the DOM in full, and the button is named after the full URL (`the list` > shows five targets…).
- Two failures in a row (a 500, then a network `TypeError`): each restores the row, toasts and refocuses its `Remove`; Esc on a second row's question also restores focus (`after a failure` > two failures in a row…).

I read the code for the other inputs: removal of the first, middle and last row (covered by the screen tests); a reload before the removal (hook test, mutated); a removal answered 404 after a reload dropped the row (the filter is a no-op and focus falls to the same index or the `h1`); Esc while removing (tested, mutated); the service list failing while `listTargets` works (tested); a 401 during a reload (the shell ends the session; the 401 case is tested for removal only, same handler).

## 7. Integration tests and running the app

- Integration tests: **not run**. The task touches no backend code and no code with integration tests, and the `handler` package does not compile on `main` (Blocking 1). No criterion depends only on them.
- Built app: **not run**. `go build ./...` fails in `internal/handler` (Blocking 1), so the binary that serves the screen cannot be built. The verification above is by tests, mutation and reading.

## 8. Findings

### Blocking

1. **`make check` fails; criterion "`make check` passes" is not met.** This is not caused by the diff.
   - Reproduce: `make check` (or `cd backend && go build ./...`) on this branch or on `origin/main`.
   - Result: `internal/handler/target_mapping.go:56:20: unknown field Id in struct literal of type api.Target`, plus `FromWebhookTargetInput`, `api.Webhook`, `api.Email` undefined.
   - Cause: contract fix `9002110` regenerated the Go `Target` as a union; `handler/target_mapping.go` (from `targets-api`) was not updated.
   - Needs: a backend fix by the user or its own task (the frontend task may not touch `backend/**`). After that, `make check` can be run again; I expect the frontend half to stay green.

### Non-blocking

1. **Test quality: the "failed reload with rows on screen" criterion is only reached through the delete-404 refetch.** The task's screen test for a failed reload and the "both banners" test are one test. Matters when: a real reload (a refresh button or polling for this list) is added; then the screen-level `refreshFailed` path has no test of its own (the hook test `useTargetList` > a failed reload covers the hook).
2. **Latent bug (report only): the focus effect in `AlertList` waits forever if a 404-removed target is still in the list.** If the refetch after `already removed` returned the same target, the effect returns early and focus stays where it was. No trigger: ids are UUIDs and a 404 means the target is gone.
3. **Latent bug (report only): `useRemoveTarget` keeps `askedId` if `serviceId` changes while the page stays mounted.** No link goes from one alert list to another, so it cannot happen today. Matters when: a service switcher or a prev/next link appears on this page.
4. **Cosmetic: `TargetRow`'s Esc guard duplicates the hook's.** Behavior is right either way (mutation, section 5). Report only.

## 9. Docs or specs that no longer match

- `STACK.md` names libraries without versions, so nothing there is out of date. Versions this task relies on, no change: `@tanstack/react-query` 5.107.1, `lucide-react` 1.73.0, `@base-ui/react` 1.9.0, `react-router` 8.5.1; no dependency was added, so nothing is adopted.
- `docs/design/README.md`: the dashboard board draws `Alerts` as a button; the app builds a link (the user's decision in the task). The README's table of differences between boards and the built app has no row for it. The same table could list the delivery notice becoming a link (row at line 30 says it comes from `listServices`; it is now also a link to the alert list).
- `docs/design/README.md` "Additions that are built" line 43 describes the inline two-step confirm; it is now built in `alert-list`, but the README does not say where.
- `docs/openapi.yaml` and `docs/requirements.md`: no mismatch found. The statuses the screen handles are those the contract lists, plus "anything else".
- `docs/tasks/backlog.md`: the loose end at line 89 (services query key exists twice) is unchanged by this task, as the task said.
