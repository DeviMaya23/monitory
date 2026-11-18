# Verification report: target delivery notice

Verifier branch: `verify/target-delivery-notice` (built on builder branch `feat/target-delivery-notice`, commit 04e0195)

**Result: no Blocking findings.** `make check` passed (exit 0, 549 frontend tests passing). After adding my test rows I re-ran the alert-list tests (200 passed), ESLint and `tsc -b` (clean). I ran `npm ci` first because the worktree had no frontend dependencies (lockfile unchanged).

## Acceptance criteria

TR = `components/TargetRow.test.tsx`, AL = `components/AlertList.test.tsx`. "Real?" = fails when the behavior is removed (confirmed by mutation where noted, see "Mutation checks run").

| # | Criterion | Test | Real? | Verdict |
|---|---|---|---|---|
| 1 | Email and webhook with `true`: exactly one `.notice--warn`, exact text, aria-hidden icon, after `.target__addr` in `.target__main` (FR-86) | TR `%s target > shows one warning notice with the fixed text after the address…` (both kinds) | Real: M1 none needed, M2 (never) and M5 (text) fail it | Met |
| 2 | Same two with `false`: no `.notice`, no text containing `delivery` (FR-86) | TR `shows nothing when it did not` | Real: M1 (always) fails it; M3 (inverted) fails it | Met |
| 3 | Flagged, unnamed target keeps `Unnamed …`, chip, address, `Edit/Remove {label}` names | TR `keeps the name fallback, chip, address and button names…` | Partly real: guards against the notice disturbing other parts; it does not fail under M1/M2 (it is a "nothing else changed" test) and would fail only if a name, chip or label were altered | Met |
| 4 | `asking`, and `asking`+`removing`: `true` shows, `false` none | TR `follows the flag while asking` / `…asking and removing` | Real: fail under M1, M2, M3 | Met |
| 5 | No role / aria-live on the notice or an ancestor in the row | TR `is not a live region and has no role` | Real: M6 (`role="status"` added) fails it. Limit: it checks the default row (not `asking`, where the confirm group has `role="group"` by design, outside the main part) | Met |
| 6 | Name `<b>x</b>` with flag: fixed text, no `b` element (NFR-7) | TR `renders a flagged name as text with the same fixed notice (NFR-7)` | Real for the text half (M2, M5 fail it). The "no `b`" half holds because React escapes; it would fail only if `dangerouslySetInnerHTML` were introduced | Met |
| 7 | Three targets, only the middle `true`: one notice, in the middle row, order kept, sub line unchanged (FR-86, FR-17) | AL `shows the notice only in the flagged row, in server order…` | Real: fails under M1, M2, M3 | Met |
| 8 | None flagged: no notice; all flagged: three | AL `shows none when none is flagged and three when all are` | Real: fails under M1, M2, M3 | Met |
| 9 | A reload made to fail (404 removal + rejected refetch) leaves rows under the `Something went wrong.` banner | AL `keeps the rows under the banner when a reload fails after a 404 removal` | Real for the notice assertion (fails under M2, M3); the banner path is also covered by existing tests | Met |
| 10 | Disappears: both `true`, `Try again` with `false`: notice gone, row stays, banner gone (FR-86) | AL `drops the notice when a reload says false for that target` | Real: fails under M1, M2, M3 and M4 (flag kept in state) | Met |
| 11 | Appears: both `false`, `Try again` with first `true`: notice appears | AL `shows the notice when a reload says true for a target that showed none` | Real: fails under M2, M3 and M4 | Met |
| 12 | Edit through the dialog answered `true` (stays) / `false` (gone), other rows unchanged | AL `edit through the dialog on a flagged row, answered with true / false` | Real: fail under M1, M2, M3; the `false` case also under M4 | Met |
| 13 | Removing a flagged target (204): row and notice gone, no other row gains one | AL `removing a flagged target (204)…` | Partly real: fails under M1 and M3 (other rows gain a notice or the removed one persists); under M2 it fails only through the earlier setup | Met |
| 14 | Removal question open and `Cancel` keep the notice | AL `keeps the notice while the removal question is open and after Cancel` | Real: fails under M1, M2, M3 | Met |
| 15 | Dashboard unchanged: `ServiceRow`/`ServiceList` tests not edited, still pass | `git diff --stat` shows neither file touched; both pass in `make check` | Real (diff-based) | Met |
| 16 | `make check` passes | Run by me, exit 0 | n/a | Met |
| 17 | Nothing outside allowed paths changed; `package.json` and lockfile unchanged | `git diff --stat f148d13..HEAD`: `TargetRow.tsx`, the two test files, the plan file | n/a | Met |
| 18 | `vi.mock` factory gains `updateTarget`; no existing case edited | AL diff: only the import line and the factory changed, plus appended cases | n/a | Met |

Requirement IDs: FR-86 (alert-list display) met by rows 1, 2, 4, 7, 8, 10 to 14. NFR-7 met by rows 1 and 6 (constant text, nothing from the server).

## Plan check

Plan `docs/tasks/target-delivery-notice.plan.md` against the task file:

- Every criterion has a plan line (rows 1 to 14, plus `make check` and the mock change). Nothing is missing from the plan.
- Every ticked item has an existing test that checks the behavior (verified by mutation above). The "Integration tests: not run" tick is correct: no backend code is touched.
- Plan vs diff: the plan's "no CSS change" matches the diff (`alert-list.css` untouched). The "Added `type Target` to the import" judgment call matches the diff. No difference found.
- The plan says "mutation check: always shown fails 14, never shown fails 16". I reproduced exactly those numbers.

## Rule checks (by reading the diff)

- **TargetRow.tsx:** the notice renders from `target.last_delivery_failed === true` only; no `useState`/`useEffect` copies the flag; no new prop; `AlertList.tsx` not in the diff; text is one module-level constant with no server text; the `p` has no `role`, `aria-live`, link or button; the icon is Lucide `TriangleAlert`, `aria-hidden="true"`, `className="icon icon--sm"`; no `dangerouslySetInnerHTML`. Markup matches the board's `alerts.html` (same `p.notice.notice--warn`, svg, span, after `.target__addr`) with no board code copied.
- **Wording:** the sentence matches the board character for character (grep of `docs/design/alerts.html`).
- **Dependencies:** none added; `package.json` and `package-lock.json` not in the diff. No version change. `lucide-react` `TriangleAlert` import is as `TargetDialog.tsx` does.
- **Untouched files:** the diff stat is `TargetRow.tsx`, `TargetRow.test.tsx` (new), `AlertList.test.tsx` and the plan. No `TargetDialog`, `service-list`, `components/ui`, `styles`, hooks, `fixtures.ts`, or `alert-list.css` changes.
- **CSS (read, jsdom cannot prove layout):** `.notice` is `inline-flex; align-items: flex-start` with token values; `.target__main` is a flex column with `min-width: 0` and `.target__addr` has `overflow-wrap: anywhere`, so a long URL wraps. The notice's text span wraps on spaces. The 360 px stacking of actions comes from the existing container query. `docs/design/alerts.css` has no `.notice` rule, so no rule is missing. One thing to note: `.notice` inside the column flex container is stretched to the column width, which is the same as on the board.
- **CONVENTIONS.md:** frontend-only change; no layer, data-scoping or transaction rule applies. No hand-written version of a library component (the notice uses the project's existing `.notice` class).
- **Fixtures:** `test/fixtures.ts` unchanged.

## Mutation checks run (all reverted; `git status` clean afterwards)

| # | Mutation in `TargetRow.tsx` | Result |
|---|---|---|
| M1 | Condition replaced by `true` (always show) | 14 failed |
| M2 | Condition replaced by `false` (never show) | 16 failed |
| M3 | Condition inverted (`=== false`) | 19 failed |
| M4 | Flag copied into `useState` at mount | 3 failed (reload disappears, reload appears, edit answered `false`) |
| M5 | Sentence shortened (NFR-7 / wording) | 11 failed |
| M6 | `role="status"` added to the notice | 2 failed (the two live-region tests) |

## Extra cases tried (added as rows in the existing test files; all pass)

- TR: spaces-only name with the flag (fallback name kept, one notice) and a webhook with a 2,048-character URL / an email with a 50-character local part (one notice, address intact). Layout of the overflow is by CSS reading only.
- AL: five flagged targets show five notices.
- AL: a reload answered while another row's removal question is open: the question stays, the notice follows the data (Second drops, Third keeps).
- Already covered by the builder: an edit answered with a flag different from the list's (rows 12).

## Integration tests

No tests of this kind exist for this task and the task touches no backend code, so `make test-integration` was not needed: **not run: frontend-only task, no integration tests apply.** No criterion depends only on integration tests. End-to-end journeys belong to the milestone's last task.

Live run of the built app: **not run.** Until `delivery-outcome` merges the server always answers `false`, so the notice cannot show in the running app (task file, Out of scope). The tests with fixtures are the evidence.

## Findings

### Blocking

None.

### Non-blocking

1. **Test quality: row 5's live-region test only checks the default row.** Category: test quality. Matters when: someone wraps the notice in a role-bearing element only in the `asking` state.
2. **Decision needed: FR-86 says the notice is shown "on the admin dashboard".** The alert-list notice follows the board and the task file, but `docs/requirements.md` does not mention the alert list. Matters when: someone reads FR-86 to decide whether the alert-list notice is in scope, for example when drafting `delivery-outcome` or the milestone's end-to-end tests.
3. **Cosmetic: the 360 px layout is checked by reading CSS only.** Category: cosmetic. Matters when: the first milestone narrow-screen manual check (NFR-3) is run; the "Narrow screens" section of `docs/manual-checks.md` is where a person confirms it. No test can prove it.

## Docs or specs that no longer match

- `docs/requirements.md` FR-86: names only the dashboard as the place of the notice; the alert list now also shows it (see finding 2). The user decides whether to edit it.
- `docs/openapi.yaml`: no change needed; `Target.last_delivery_failed` is already in the contract.
- `STACK.md`: no dependency was added and no version adopted; nothing to record.
- `docs/tasks/backlog.md`, row "FR-84, FR-85, FR-86": still lists the work as not built; this task covers the alert-list display only, and the server half (`delivery-outcome`) is still open, so the row stays until then.
