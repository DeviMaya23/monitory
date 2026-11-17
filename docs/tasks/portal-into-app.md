# Task: portalled popups inside the app scope

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The dialog, the alert dialog and the select list are rendered by Base UI into `document.body`, outside the element that carries the class `app` (`#root`). So none of the rules scoped to `.app` reach them: the `@container app (max-width: 640px)` rules (the 360 px sheet, the stacked dialog footer), the shared focus ring `.app :focus-visible`, the `.app` font and the element resets. After this task the three wrappers render their popups inside a host that has that scope, and the viewport is still what they cover. The next frontend task (`target-form-dialog`) builds a large form in a dialog and depends on it.

Requirements covered:

- NFR-4, in part: the focus mark of a button, an input and an option inside a popup is the shared one (`.app :focus-visible`), as on the page. No test can prove it (jsdom has no layout or focus ring): the criteria below prove that the popup is inside an `.app` element, the verifier reads the CSS, and the user checks the ring by hand.

Out of scope:

- The toast viewport (`components/ui/Toast.tsx`). It is not portalled; it sits in `.app` already. Whether `position: fixed` inside `.app` (which has `container-type: inline-size` and so contains fixed descendants) behaves for it is not checked here.
- Any change to the look or the behavior of the three components, to their props or to their callers' code.
- The `Switch` wrapper (not portalled) and any new wrapper.
- A `Select` opened inside a `Dialog`: no caller does that today; its list would paint under the dialog layer (`.menu-layer` z 10, `.dialog-layer` z 20) before and after this task, and nothing here changes it.
- A browser check of the milestone boards (`docs/manual-checks.md`); the verifier reads the CSS and the user checks the look.

## Prerequisite

`add-service-screen` and `delete-service-dialog` are merged (they added `AlertDialog`, the discard dialog and the method select, the three users of the portals). No other prerequisite.

## Role and ownership

Role: Frontend.

You may change `frontend/src/components/ui/**` and `frontend/src/styles/components.css`. You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), `frontend/index.html`, the lint and build configuration under `frontend/`, `backend/**`, `docs/**` (except your own plan file, `docs/tasks/portal-into-app.plan.md`), or any file under `frontend/src/features/**`, `pages/**` or `app-shell/**`.

Shared files this task touches, all owned by this task while it runs: `components/ui/Dialog.tsx`, `AlertDialog.tsx`, `Select.tsx` and their tests; `styles/components.css`.

Tasks that may run at the same time: `alert-list-screen` (frontend, but it touches no file listed above) and `alert-dispatch` (backend). `target-form-dialog` waits for this task: it changes `Dialog.tsx` and `components.css` too.

## Operations used

None. No request is made.

## Behavior

### What exists

- `Dialog.tsx`, `AlertDialog.tsx` and `Select.tsx` each wrap Base UI parts and render `<…Portal>` with no `container`, so the popup goes to the end of `document.body`.
- `components.css` puts `container: app / inline-size`, `position: relative`, `min-height: 100%`, the font, the colours and the resets on `.app`, and the focus rule on `.app :focus-visible`. `index.html` has `<div id="root" class="app">`. The tokens are on `:root`, not on `.app`.
- `.dialog-layer` is `position: fixed; inset: 0; z-index: 20`, `.menu-layer` has `z-index: 10`.
- Because `.app` has `container-type: inline-size`, it contains `position: fixed` descendants: a popup put straight into `.app` would cover the app's box, not the viewport, and would scroll with a tall page. So the popups cannot simply be portalled into `#root`.

### The portal host

One element, `div` with the classes `app portal-host` and the attribute `data-portal-host`, created once, lazily, the first time a wrapper renders, and appended to `document.body`. A helper `getPortalHost()` returns it, creating it when it does not exist (or is no longer in the document). All three wrappers pass it as `container` to their Base UI portal. It never holds anything of its own: its children are the popups the library renders.

Rules for the host (in `components.css`):

- It covers the viewport and ignores the pointer itself: `position: fixed`, `inset: 0`, `min-height: 0`, a transparent background, `pointer-events: none`, so that the page under it stays usable and the `.app` rules that would paint or size it do not. Without `pointer-events: none` a full-viewport host would block the page permanently.
- Everything inside the host takes the pointer back: one rule for the whole subtree (`.portal-host *`, `pointer-events: auto`), not a list of class names, because the library renders unclassed elements there too (its modal blocker behind a dialog or a select list). So a click outside an open select list is still blocked, as today.
- The rule that sets `.portal-host` is placed after the `.app` rule in `components.css` (equal specificity: order decides), and says so in a comment.
- Its stacking keeps what exists today: popups are above the whole app, so above the toast viewport (the toast is inside `#root`'s stacking context, the popups were and are siblings of it in `body`), and the dialog layer (20) is above the select layer (10). Do not try to put a toast above a dialog. If a host `z-index` cannot keep this order, stop and ask.
- It gets the `.app` scope by carrying the class `app`: the container query, the font, the resets and the focus ring then apply inside it. The container's width is the viewport's, because the host is `fixed` and `inset: 0`, so the 640 px rules fire at the same width as for the page.

The choice of exact property values is the builder's, within these rules; the plan states them and why.

### The three wrappers

- `Dialog` and `AlertDialog` pass the host as `container` to their `Portal`; `Select` does so for its `Portal`. Nothing else in the three files changes: props, classes, focus handling and callbacks stay as they are.
- A popup inside another popup (a select inside a dialog) renders into the same host.
- `getPortalHost()` is called while the wrapper renders (also when it is closed) and may create the element then: it is idempotent, so a second render or StrictMode's double render creates nothing new. It re-checks on every call that the element is still in the document.

### Known gaps

- **The host stays in `body`** after the last popup closes (an empty fixed element that ignores the pointer).
- **The reduced-motion rule** `.app * { transition: none }` now also reaches the popups (intended: they are `.app` content again).
- **A `Select` opened inside a `Dialog`** is not supported or tested (see Out of scope); with an explicit `container` it becomes a sibling of the dialog's portal node instead of its child, which is a behaviour no caller depends on.
- **Tests run without `#root`.** The host works the same in jsdom; the page content a test renders is not inside an `.app`, which is fine.
- **The toast viewport** is not touched (see Out of scope).

## Structure

- `frontend/src/components/ui/portalHost.ts` (new) with `portalHost.test.ts` (new): `getPortalHost()` as above. Used only by the three wrappers; it holds no Base UI import. It is a new shared module under `components/ui/`, approved by the user with this task.
- `Dialog.tsx`, `AlertDialog.tsx`, `Select.tsx`: the `container` on their portal.
- `frontend/src/styles/components.css`: the `.portal-host` rules and the `pointer-events` restoration, next to the rules for the dialog and menu layers, with a comment that says why the host exists.

## Design reference

None to copy. `docs/design/components.css` shows the board's `.app` frames and the sheet rules that should now apply (`.dialog-layer--sheet`, `.dialog--sheet`, the stacked `.dialog__foot`). Do not change those rules.

## Dependencies

None. `@base-ui/react` 1.9.0 (the `container` prop of its portal parts) is installed; `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion under the next three headings is a test that fails if the behavior were removed; the repo-wide items are checks, and the layout is the verifier's reading and the user's hand check.

**`getPortalHost` (`portalHost.test.ts`)**

- Called twice, it returns the same element; the element is a child of `document.body`, has the classes `app` and `portal-host` and the attribute `data-portal-host`; there is exactly one in the document afterwards.
- If the element has been removed from the document, the next call creates a new one.

**The wrappers (their existing test files, one added case each)**

- An open `Dialog`: the element with role `dialog` has an ancestor `.app.portal-host`; that ancestor is a child of `body`; it is not inside the element that holds the test's own render. The same for an open `AlertDialog` (role `alertdialog`) and for the open list of a `Select` (role `listbox`).
- Two popups open at once, a `Dialog` and an `AlertDialog` as siblings (not a `Select` inside a `Dialog`): both are inside the one host; there is one host in the document.
- The existing tests of the three components pass unchanged (Esc, backdrop, focus start and return, `busy`, selection). No existing test queries a popup by its container (`screen` and `document` queries are unaffected); `App.test.tsx`'s observers on `document.body` are not tripped by an extra empty element. The builder checks this and says so in the plan.
- `portalHost.test.ts` removes the host from the document after each test, so that tests do not depend on each other.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

## Verifier checks

- **By reading `components.css`:** the host rules are those in "The portal host", after the `.app` rule; the subtree rule restores the pointer for every element inside; the existing `.dialog-layer`, `.dialog--sheet`, `.dialog__foot` and `.menu-layer` rules are unchanged; the stacking order is the same as before (popups above the app and the toast; dialog layer above the select layer; reason from the `z-index` values and stacking contexts and write it in the report); the host sets nothing that the `.app` rule's `background`, `min-height` or `position: relative` would turn into a visible box.
- **By reading the wrappers:** each portal passes `container`; no other behavior changed; no new Base UI import outside `components/ui/`.
- **By reading `index.html` and the tokens:** the tokens are on `:root` (so the host needs no theme code), and `#root` still has the class `app`.
- **Inputs to try, by reading and in tests:** a dialog opened over a tall scrolled page (the fixed host, not `#root`, is the containing block); two dialogs in a row (the select-inside-dialog case is a known gap and is only read, to confirm it is unchanged); a dialog open during a rerender of its parent; a portal opened before `document.body` has other content.
- **What the verifier cannot prove** (jsdom has no layout): that the 360 px sheet, the stacked footer and the focus ring now apply, and that the container is as wide as the viewport so the 640 px rules fire when the page's do. Say so in the report; the user checks it by hand.

## Stop and ask when

- The contract, a requirement or this file conflict with each other.
- You think you need a change outside your paths, a dependency, or an edit to `index.html`.
- Base UI 1.9.0's portal does not accept a `container`, or the host cannot keep the stacking order without changing an existing `z-index`.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
