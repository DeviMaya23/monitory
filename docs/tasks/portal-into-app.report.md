# Verification report: portal-into-app

Verifier branch: `verify/portal-into-app` (reset onto `feat/portal-into-app` at `4e7c333`, plus one test added by the verifier).

**Result: no Blocking findings.** One decision for the user (toast now sits under dialogs; see Non-blocking 1).

`make check`: passed (lint, openapi-lint, 330 frontend tests, build, Go build). The first run failed only because `frontend/node_modules` was missing (`eslint: command not found`); after `npm ci` it passed. Integration tests: **not run** — the task touches no backend code and no code that has integration tests (frontend only).

## Acceptance criteria

| # | Criterion | Test | Real? | Status |
|---|---|---|---|---|
| 1 | `getPortalHost()` twice → same element, child of `body`, classes `app portal-host`, attribute `data-portal-host`, exactly one in document | `portalHost.test.ts` › "returns one element in body…" | Yes. Mutated "always create" and "drop the `app` class": both fail it | Met |
| 2 | Host removed from document → next call creates a new one | `portalHost.test.ts` › "creates a new one when the element was removed…" | Yes for the behaviour (it fails if lookup were cached), but the `isConnected` check itself is redundant: `document.querySelector` only finds connected nodes, so dropping it leaves the test green (equivalent mutant) | Met |
| 3 | Open `Dialog`: role `dialog` inside `.app.portal-host`, child of `body`, outside the render container | `Dialog.test.tsx` › "renders inside the app-scoped portal host…" | Yes: removing `container` from `Dialog.tsx` fails it | Met |
| 4 | Same for `AlertDialog` | `AlertDialog.test.tsx` › "renders inside the app-scoped portal host…" | Yes: removing `container` fails it | Met |
| 5 | Same for the `Select` list (`listbox`) | `Select.test.tsx` › "renders its list inside the app-scoped portal host…" | Yes: removing `container` fails it | Met |
| 6 | `Dialog` + `AlertDialog` open as siblings: both in the one host, one host in the document | `AlertDialog.test.tsx` › "shares the one host with a Dialog open beside it" | Yes: removing `container` from either wrapper fails it | Met |
| 7 | Existing tests of the three components pass unchanged; `App.test.tsx` observers not tripped; plan says so | whole suite (330 pass); diff touches no existing test line | Yes (suite is green; diff for the three test files is additions only) | Met |
| 8 | `portalHost.test.ts` removes the host after each test | `afterEach` in `portalHost.test.ts` | Yes: without it, criterion 1's "exactly one" would see leftovers | Met |
| 9 | `make check` passes | run by me | n/a | Met |
| 10 | Nothing outside allowed paths changed; `package.json` and lockfile unchanged | `git diff 429e97f..HEAD --name-only`: only `components/ui/**`, `styles/components.css`, the plan | n/a (check) | Met |
| 11 | NFR-4 (in part): popups are inside an `.app` element so the focus rule reaches them | criteria 3–6 prove containment; CSS read (below) | Containment: real. The ring itself: cannot be proven in jsdom | Partly met, as the task intends; user checks the ring by hand |

## Plan check

Read after the criteria pass. Every criterion is in the plan checklist; every ticked item has a test that exists and checks the behaviour (matched above). Differences between plan and diff: none. The plan says the `.portal-host` rule is "placed after the dialog/menu rules"; in the diff it is placed after `.menu-layer` and before the Dialog section, which is after the `.app` rule (line 10) as required.

The plan's judgment call 1 is correct and matters: see Non-blocking 1.

## Rule checks

- **Dependencies:** `package.json`, lockfile, `index.html`, backend, features, pages, app-shell untouched. `@base-ui/react` stays `1.9.0`.
- **Base UI imports:** only in `components/ui/`; `portalHost.ts` has none. Each of the three portals passes `container={getPortalHost()}`; the diff of the three wrappers is that line and the import, nothing else.
- **No hand-written replacements, no design code copied:** none.
- **Tokens and `#root`:** tokens are on `:root` (`tokens.css:15`; dark theme via `:root:not([data-theme="light"])` and `[data-theme="dark"]`), so the host needs no theme code. `index.html` still has `<div id="root" class="app">`.
- **`components.css`** (diff: 18 added lines, 0 removed, so existing `.dialog-layer`, `.dialog--sheet`, `.dialog__foot`, `.menu-layer` rules are unchanged). `.portal-host` sits after `.app` (line 10 vs 459) with a comment saying so; sets `position: fixed; inset: 0; z-index: 40; min-height: 0; background: transparent; pointer-events: none`; `.portal-host * { pointer-events: auto }` covers every descendant. `color`, `font`, `container` stay from `.app`, which is intended. Nothing visible: the host has no background, border or size of its own.
- **Stacking, reasoned and measured.** Host `z-index: 40` makes it its own stacking context; inside it the dialog layer/backdrop (20) is above the select layer (10), as before. Against the toast (`.toast-viewport` z 30): see Non-blocking 1.
- **Containing block:** headless Chrome on the real `tokens.css` + `components.css` (static page, 3000 px tall, scrolled 500 px): the host and `.dialog-layer` measured `0,0,<viewport>`, i.e. the viewport, not `#root`'s box; the host never captured the pointer (`pointer-events: none`, computed).
- **Conventions (layers, scoping, transactions):** not applicable, no backend code.

## Mutation checks run

| Mutation | Result |
|---|---|
| Remove `container` from `Dialog.tsx` | `Dialog` test and the shared-host test fail |
| Remove `container` from `AlertDialog.tsx` | its own test and the shared-host test fail |
| Remove `container` from `Select.tsx` | the `Select` test fails |
| `getPortalHost` always creates a new element | criterion 1 test fails |
| Host loses the `app` class | criterion 1 test fails |
| Drop `existing.isConnected` | **no test fails** (equivalent mutant, see Non-blocking 3) |
| CSS: delete `pointer-events` rules, change `position`, `z-index` | **not testable**: jsdom has no layout; covered by reading and the Chrome measurement above only |

All source was reverted (`git checkout` / backup copy); the tree only differs by the added test.

## Cases tried beyond the task file

- Parent rerender while the dialog is open, closing and reopening the dialog: added test `Dialog.test.tsx` › "keeps the same host, with the dialog in it, when the parent rerenders and when it opens again" — passes; one host throughout.
- Two popups in a row and side by side: covered by criterion 6 and the added test.
- Dialog over a tall scrolled page: measured in Chrome (above), host is the viewport.
- Portal opened before `body` has other content: `getPortalHost` appends to `body` on demand; the `portalHost` tests run on an empty body.
- Select inside a Dialog (known gap): read only. Both render into the same host; the select layer (10) still paints under the dialog layer (20), same as before. Unchanged.
- Limits, malformed input, concurrent writes: no inputs or writes exist in this task.
- Existing `Select` tests that the plan calls flaky ("lists every option", "picks with the arrow keys"): several runs here (make check twice, the ui folder three times), no failure.

## Findings

### Blocking

None.

### Non-blocking

1. **Toast now sits under dialogs; the task's premise was wrong.** (decision needed) The task says the toast is inside `#root`'s stacking context so popups already paint above it. Measured in headless Chrome with the real CSS: with the layers directly in `body` (the old arrangement) the toast (z 30) paints **above** `.dialog-layer` (z 20); with the host at `z-index: auto` the toast also stays above; with the host at 40 the dialog layer is above the toast. So the builder's `z-index: 40` follows the task's stated intent ("popups are above the toast", "do not put a toast above a dialog") but changes today's real order, and the "same stacking order as before" check does not hold. Matters when: a toast fires while a dialog or alert dialog is open (for example a failed removal in the alert list, or a save result while a dialog is still closing): the toast is then under the backdrop and cannot be read. To keep today's order, set the host `z-index` to a value below 30 (for example 25).
2. **Existing `Select` tests may be flaky.** (test quality) The builder reports "lists every option" and "picks with the arrow keys" fail about half the time in single-file runs because they query `listbox` synchronously. Not reproduced here. Matters when: CI shows a red `Select.test.tsx` on an unrelated change. Not touched, per the task.
3. **`existing.isConnected` is redundant.** (cosmetic) `querySelector` only returns connected nodes. Matters when: someone later changes the lookup to a cached reference; then the check starts to matter and no test pins it beyond criterion 2. Report only.
4. **`getPortalHost()` mutates the DOM during render.** (latent bug) Idempotent and harmless today; a discarded concurrent render would leave an empty fixed, pointer-ignoring element, which is already the documented known gap. Matters when: a test or feature counts `body` children or snapshots `body`. Report only.

## Not verified (jsdom has no layout)

That the 360 px sheet, the stacked dialog footer and the `.app :focus-visible` ring now apply inside popups, and that the container's width equals the viewport's so the 640 px rules fire when the page's do. I did not run the built app or open a real dialog in it: the Chrome check was a static page using the real CSS, and the ring and sheet were not looked at. The user checks these by hand (NFR-4, in part).

## Docs or specs that no longer match

- `docs/tasks/portal-into-app.md` (Goal, "The portal host", Verifier checks) states the toast is in `#root`'s stacking context and popups are therefore above it today. Measured: they are not; the task file's premise is wrong (Non-blocking 1).
- `docs/tasks/backlog.md` line 91 (toast viewport `position: fixed` in `.app`) stays valid; this task did not touch the toast. Its trigger gets one more case: the toast's order against dialogs (Non-blocking 1).
- `STACK.md`: no version adopted or changed (`@base-ui/react` 1.9.0 was already installed; STACK.md names no versions).
- `docs/openapi.yaml`, `docs/requirements.md`: unaffected.
