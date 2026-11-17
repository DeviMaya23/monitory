# Verification report: delete service dialog

Branch: `verify/delete-service-dialog` (the verifier's branch, reset onto `origin/feat/delete-service-dialog` at `3856565`, plus the tests and this report).

Verdict: **no Blocking findings.** Two Non-blocking findings, both report-only or already resolved.

## `make check`

- `make check` as run on this branch: **fails** at `lint-md`. `docs/tasks/delete-service-dialog.md:80` has MD038 (spaces inside code spans). That is the task file, which the builder may not edit. Everything else in `make check` passes: gofmt and golangci-lint (0 issues), ESLint, Stylelint, shellcheck, `openapi-lint`, Go tests, 317 frontend tests (now 328 with the verifier's additions), the Go and Vite builds.
- `make check -o lint-md`: exit 0.
- `origin/main` (`c915a04`, PR #11) has already taken markdown lint out of `make check`. This branch merges cleanly with it, so the criterion holds on the merged result. See Non-blocking N1.

## Criteria

"Real?" = would the named test fail if the behavior were removed. "Yes (M#)" means I confirmed it by a mutation, listed below.

| # | Criterion | Test | Real? | Result |
|---|---|---|---|---|
| 1 | `deleteService`: one `apiRequest('DELETE', '/api/services/abc')`, resolves `undefined`; id encoded; rejection unchanged (NFR-8) | `services.test.ts` › sends one DELETE…, encodes the id…, lets a rejection reach the caller unchanged | Yes (M14) | Met |
| 2 | `AlertDialog`: role `alertdialog`, named by title, described by body, focus on `initialFocus` | `AlertDialog.test.tsx` › is an alertdialog named by its title… | Yes (M9) | Met |
| 3 | Esc calls `onClose` once, focus to opener; backdrop click does not call it; `busy` blocks Esc; footer renders (NFR-4) | › closes on Esc once…, does not close on a backdrop click, ignores Esc while busy | Yes (M8 for busy). Backdrop test passes only because Base UI's alert dialog ignores outside presses; it would fail if the wrapper were swapped for the plain dialog (not mutated) | Met |
| 4 | `finalFocus` overrides the opener | › sends focus to finalFocus on close…, goes back to the opener when finalFocus returns null | Yes (M10) | Met |
| 5 | Hook: `ask`/`cancel` send nothing; `confirm` once, in flight until settled, second `confirm` sends nothing (FR-72) | `useDeleteService.test.tsx` › asking and sending (3 tests) | Yes (M3) | Met |
| 6 | 204: exact removal, order, `dataUpdatedAt` kept, no refetch, success toast, asked cleared, last leaves `[]` (FR-8) | › a 204 › drops exactly that service…, leaves an empty list… | Yes (M2, M7). Identity of the other objects is not asserted (`toStrictEqual`); the plan says why (structural sharing) and the task wording "keep their object" is met in value and order only | Met |
| 7 | In-flight list request cancelled on 204 | › cancels a list request that started before the delete… | Yes (M1) | Met |
| 8 | 404 `not_found`: removal, already-deleted toast | › a 404 not_found | Yes (M4) | Met |
| 9 | 403 `csrf_failed`: cache unchanged, `Reload` action reloads once (NFR-8) | › a 403 csrf_failed | Yes (M6 for the code check) | Met |
| 10 | 500, network error, 403 other code, 404 no body, 404 other code → generic toast, cache kept, asked cleared | › any other failure (5 rows) | Yes (M6) | Met |
| 11 | 401: no toast, asked cleared | › a 401 unauthenticated | Yes (M5) | Met |
| 12 | No cache entry → none created | › creates no cache entry when there is none | Yes: removing the `!entry?.data` guard would write a `[]`-less entry; not mutated, reasoned from `setQueryData` semantics | Met |
| 13 | Unmounted during the request, 204 still removes and toasts | › still removes the service… gone before the answer | Yes (M7 fails it; the toast and cache change are in the mutation options) | Met |
| 14 | Dialog: title, 3 / 1 / 0 target texts, second paragraph (FR-72) | `DeleteServiceDialog.test.tsx` › names the service…, it.each | Yes (M12) | Met |
| 15 | `<b>x</b>` is text, no `b` element (NFR-7) | › shows a name with markup as text | Yes (M16) | Met |
| 16 | `Cancel` focused; `Trash2` on Delete; deleting disables both, `Deleting…`, `aria-busy` | › starts on Cancel…, while deleting disables both… | Yes (M13) | Met |
| 17 | Screen: one `Delete {name}` button per row (paused, TCP), hidden `.btn__label`, header gains `Actions` | `ServiceList.test.tsx` › has one Delete button per row…, gives paused and TCP rows…, lists the six column header words and Actions | Yes: removing the button or the header span fails them | Met |
| 18 | Click opens dialog, no request, each row its own name and count | › opens the dialog of the clicked row… | Yes (M15) | Met |
| 19 | Cancel and Esc close with no request, focus back on that row's button; backdrop leaves it open (NFR-4) | › Cancel and Esc close it… | Yes (M10) | Met |
| 20 | One request with the id; pending state; Esc and second click do nothing | › sends one request with the id; while pending… | Yes (M3, M13) | Met |
| 21 | 204: row gone, order, count line, toast, focus on `h1`; last service shows Empty block (FR-8) | › a 204 removes the row…, shows 1 service after 2 are cut to 1… | Yes (M11) | Met |
| 22 | 404 `not_found`: same removal and focus, toast | › a 404 not_found removes the row the same way… | Yes (M4, M11) | Met |
| 23 | 403 / 500 / network: dialog gone, rows kept, toast, focus on the Delete button; `Reload` only for 403 | › it.each (3 rows) | Yes for the toast text and `Reload` presence (asserted both ways, M6 shows the code check matters). The focus-back assertion was not mutated: the default return-to-opener comes from Base UI, so it would fail only if `finalFocus` wrongly returned the `h1`, which M11's inverse would cover | Met |
| 24 | Dialog text stable across a refresh; refresh that removes the service leaves the dialog; confirm answered 404 gives the toast | › keeps the text of the dialog when a refresh changes the count… | Yes (M15) | Met |
| 25 | `Updated {time}` unchanged after a removal | › keeps the time of the last real response after a removal | Yes (M2) | Met |
| 26 | App: delete answered 401 → sign-in form, notice, no toast, cache gone (FR-4) | `App.test.tsx` › a delete answered 401… | Yes (M5) | Met |
| 27 | Tests changed on purpose, and nothing else loosened | `ServiceList.test.tsx` diff read: the button assertion now names the two Delete buttons; the forbidden `Pause/Resume/Alerts/Edit` stay forbidden; mock is the pass-through form in all three files | n/a | Met |
| 28 | `make check` passes | see above | n/a | **Partly met** as run on the branch (only `lint-md` on the task file fails); met on the merged result |
| 29 | Nothing outside allowed paths; `package.json` and lockfile unchanged | `git diff origin/main...HEAD --stat`: only `frontend/src/**` and the plan | n/a | Met |

Requirement IDs: FR-8 (6, 21, 22), FR-72 (5, 14, 20), NFR-4 in part (3, 19), NFR-7 (15), NFR-8 (1, 9). The `NFR-4` clause "Tab stays inside it" has no test of its own. It is Base UI's focus trap, and the task defers the keyboard journeys to the milestone 5 end-to-end suite (backlog row NFR-4).

## Plan check

Read after the criteria table.

- Every acceptance criterion appears in the plan, in the task's order. Nothing is missing.
- Every ticked item has the named test, and each one checks the behavior (see "Real?" above).
- The one unticked item, `make check`, is reported honestly and matches what I ran.
- Plan versus diff: the diff matches the plan. The plan's judgment calls are all visible in the code (`null` from `finalFocus`, `clip-path` instead of `clip`, `.svc-head > span:last-child` for the right-aligned word, `cancel()` a no-op in flight).
- Plan-only difference: the plan says the "Tests changed on purpose" were done as described; confirmed.

## Rule checks

- **Dependencies:** `frontend/package.json` and the lockfile are unchanged. Base UI 1.9.0, TanStack Query 5.107.1 and Lucide 1.73.0 are the versions already installed. `Trash2` and `LoaderCircle` exist.
- **Ownership (ROLES.md):** changes only in `frontend/src/**` and `docs/tasks/delete-service-dialog.plan.md`. `Dialog.tsx`, `Toast.tsx`, `useToast.ts`, `schema.d.ts` are untouched.
- **Layer and feature boundaries (CONVENTIONS, ARCHITECTURE):** the hook and components are under `features/service-list`; `ServiceList` imports nothing from `app-shell/` or another feature; the hook uses `servicesQueryKey` from `lib/api/services.ts`; `useServiceList.ts` unchanged. No data scoping or transaction rules apply (frontend only).
- **Hook (task "Verifier checks"):** `setQueryData` on `servicesQueryKey` with `updatedAt` kept, after `cancelQueries`; no `invalidateQueries` or refetch; toasts and cache change in `useMutation` options, none passed to `mutate`; cases chosen by `ApiError.status` and `.code`, never message text; 401 shows nothing; server data not copied into component state (the `asked` snapshot is deliberate and the task asks for it).
- **Components:** no `dangerouslySetInnerHTML` anywhere in `frontend/src`; the name is a React text child in the title, the `aria-label` and the button; only `components/ui/AlertDialog.tsx` imports `@base-ui/react/alert-dialog`; no hand-written dialog or toast; icons from Lucide only; no literal colour in the new CSS.
- **Design reference:** CSS values and rules were copied from `docs/design/dashboard.css` (grid `132px`, `.svc__actions`, the 640 px block) with one deliberate substitution (`clip-path` for `clip`, which `components.css:42` already uses). No board markup or component code copied.
- **Wording:** every string in the Outcomes and dialog tables appears once in non-test code, with the curly quotes and the ellipsis. The `Reload` text is also in `SessionProvider.tsx:74`, as the task says.
- **Keyboard, by reading:** the Delete control is a `<button>` last in the row; initial focus is the `Cancel` ref; footer DOM order is `Cancel`, `Delete service`; `h1` has `tabIndex={-1}`; the disabled buttons use `disabled`.
- **Layout, by reading the CSS:** wide grid has seven columns, `132px` last; the 640 px block adds `"actions actions"` under `check change`; `.btn__label` is visually hidden above 640 px and static inside the block; the footer stacks with `column-reverse` (`components.css:571`), so `Delete service` is on top at 360 px.
- **Contract:** the hook reads `Service.id`, `.name`, `.target_count`, all in the generated type. Handled statuses are 204, 401, 403, 404, 500 plus "anything else".

## Mutation checks run

Each was applied to the source, the service-list, `AlertDialog`, `lib/api` and `App` tests were run, and the source was restored with `git checkout` (confirmed clean).

| M# | Mutation | Result |
|---|---|---|
| M1 | remove `cancelQueries` | killed: › cancels a list request that started before the delete |
| M2 | drop `updatedAt` from `setQueryData` | killed: 6 tests (hook 204 and 404, screen meta) |
| M3 | remove the `inFlight` guard | killed: hook and screen "second click" tests |
| M4 | 404 no longer removes the row | killed: hook and screen 404 tests |
| M5 | 401 treated as a generic failure (toast) | killed: hook 401 and App 401 tests |
| M6 | `csrf_failed` decided by status only | killed: › a 403 with another code |
| M7 | `invalidateQueries` instead of the cache change | killed: 14 tests |
| M8 | Esc closes while busy | killed: › ignores Esc while busy |
| M9 | no `initialFocus` | killed: › is an alertdialog named by its title… |
| M10 | no `finalFocus` pass-through | killed: AlertDialog, 204 and 404 screen tests |
| M11 | focus never goes to the `h1` | killed: screen 204 and 404 tests |
| M12 | singular wording lost | killed: dialog tests |
| M13 | Delete button not `disabled` while deleting | killed: dialog and screen tests |
| M14 | no `encodeURIComponent` | killed: › encodes the id in the path |
| M15 | row passes a different service to `onDelete` | killed: › opens the dialog of the clicked row…, › keeps the text of the dialog… |
| M16 | strip markup from the title | killed: › shows a name with markup as text |

No mutation survived.

## Cases tried beyond the task file

Added as rows or subtests in the existing test files (no new test files):

- `useDeleteService.test.tsx` › "verifier edge cases": two failures in a row give two toasts and the same row can be asked about again, then deleted; a cancel after a removal sets `closedAs` back to `kept`; a 204 for a service a refresh already dropped leaves the others untouched.
- `ServiceList.test.tsx`: a 100-character name with no spaces, with `target_count` 0, 1, 2 and 5: the title is the full name as text, the body and the bold part have the right wording. All pass. (Wrapping and sideways scroll are CSS; `.dialog__title` has `overflow-wrap: anywhere`, `components.css:483`.)

Already covered by the builder's tests, which I confirmed by reading and by the mutations: Esc and backdrop while deleting, a refresh that removes the service while the dialog is open then a 404, a delete answered after a refresh that started earlier, paused and TCP rows, last service, 401 during a delete.

Not run: a real browser, and a 401 on a background refresh with the dialog open (the App test covers 401 on the delete itself and on a refresh, but not both together). Both are under N2.

## Integration tests

Not run. This task changes only `frontend/src/**`; no backend or integration-tested code is touched, and the task file says none applies. The integration tests that exist belong to the backend repositories and are unrelated to any criterion here. Every criterion in this task is covered by frontend unit and component tests, none depends only on an integration test.

## Findings

### Blocking

None.

### Non-blocking

**N1. `make check` fails on this branch at `lint-md` (category: decision needed).** The task file (drafter-owned) has MD038 at line 80. Reproduce: `make check` on this branch. Resolved on the merged result: `origin/main` no longer runs markdown lint in `make check`, and the merge is clean. Matters when: the user merges without updating the branch, or CI on this branch still runs `lint-md`. Merge result checked locally by reading `origin/main:Makefile`, not by running `make check` on a merge commit.

**N2. Not exercised: Tab trap, and no live run (category: test quality).** "Tab stays inside the dialog" and the real layout (wrapping at 100 characters, the 360 px stacking) are not asserted by any test; jsdom cannot show them. I read the CSS but did not run the built app. Matters when: the milestone 5 keyboard journeys and the milestone checks "Each screen the milestone added matches its board" in `docs/manual-checks.md` are run.

**N3. Other objects' identity after a removal is not asserted (category: test quality).** The task says every other service "keeps its object"; the test uses `toStrictEqual`, because TanStack's structural sharing may copy a moved object. Report only: no trigger, since nothing reads object identity today.

## Docs or specs that no longer match

- `STACK.md` names Base UI, TanStack Query and Lucide without pinning versions (ROLES.md: the user records adopted versions after merge). This work adopts no new version: Base UI 1.9.0 (now also its alert dialog), TanStack Query 5.107.1, Lucide 1.73.0, all already in `package.json`. Nothing to add unless the user wants those three recorded.
- `docs/tasks/backlog.md:71`: "the row's … Delete … (their own tasks)" is now done by this task; the Pause, Resume, public-switch and Open-link buttons remain. The `Actions` column is introduced here and its sentence in the dashboard row may be updated by the drafter.
- `docs/manual-checks.md`: no wording is out of date. "Delete it, with the confirmation" under "Before release (milestone 5)" now has its screen.
- `docs/openapi.yaml`, `docs/requirements.md`: unchanged and matching.
