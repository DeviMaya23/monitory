# Plan: portal-into-app

Branch: `feat/portal-into-app`

## Checklist

- [x] `getPortalHost()` twice returns the same element: child of `body`, classes `app portal-host`, attribute `data-portal-host`, exactly one in the document. File `frontend/src/components/ui/portalHost.ts`; test `portalHost.test.ts`.
- [x] Host removed from the document: next call creates a new one. `portalHost.ts`; test `portalHost.test.ts`.
- [x] `portalHost.test.ts` removes the host after each test (`afterEach`). Same file.
- [x] Open `Dialog`: role `dialog` has an ancestor `.app.portal-host`, a child of `body`, outside the test's render container. `Dialog.tsx`; test case in `Dialog.test.tsx`.
- [x] Same for `AlertDialog` (role `alertdialog`). `AlertDialog.tsx`; case in `AlertDialog.test.tsx`.
- [x] Same for the open `Select` list (role `listbox`). `Select.tsx`; case in `Select.test.tsx`.
- [x] A `Dialog` and an `AlertDialog` open as siblings: both in the one host, one host in the document. `AlertDialog.test.tsx` (imports `Dialog`, both are `components/ui/`).
- [x] Existing tests of the three components pass unchanged; `App.test.tsx` observers are not tripped by the extra empty element (checked: whole suite passes; its observers look only for placeholder text and the empty-list text, and the host holds none).
- [x] `components.css`: `.portal-host` rules after the `.app` rule's equal-specificity peers, and `.portal-host *` pointer restoration, beside the dialog and menu layer rules.
- [x] `make check` passes. Outcome: run, passed (2 of 2 full runs; 330 frontend tests)
- [x] Nothing outside allowed paths changed; `package.json` and lockfile unchanged.
- [x] Integration tests: not run: no backend or integration-tagged code touched, and the task names none.

## CSS values and why

- `position: fixed; inset: 0` — covers the viewport and is the containing block for the library's fixed layers, so they cover the viewport, not `#root`.
- `min-height: 0; background: transparent` — cancel the `.app` rule's `min-height: 100%` and `background`.
- `pointer-events: none` on the host, `pointer-events: auto` on `.portal-host *` — page stays usable; every library element (including unclassed blockers) takes the pointer back.
- `z-index: 40` — see judgment call 1.
- The rule is placed after the dialog/menu rules, which come after `.app` in the file (order beats equal specificity), with a comment.

## Judgment calls

1. **Toast vs dialog stacking.** The task says popups are above the toast today because the toast sits in `#root`'s stacking context. It does not: `.app` has `position: relative` but no `z-index`, so it creates no stacking context, and today the toast (z 30) paints above the dialog layer (z 20). The task says to put popups above the toast and not the other way round, so the host has `z-index: 40`. This changes today's real order (a toast shown while a dialog is open now sits under the dialog). Inside the host the dialog layer (20) is above the select layer (10) as before. If the user wants the toast above dialogs, change the host's z-index to below 30 (e.g. 25).
2. **Existing flaky test.** `Select.test.tsx` "lists every option…" and "picks with the arrow keys" fail intermittently (about half of single-file runs), with and without this change: they query `listbox` synchronously right after a click, before the popup mounts. I did not touch them. My new Select test uses `findByRole`.
3. **Two popups at once in the test.** The second modal marks the first inert, so my `Dialog` + `AlertDialog` test finds both with `hidden: true`.
4. **Host lookup.** `getPortalHost()` finds the host with `document.querySelector('[data-portal-host]')` and checks `isConnected`, so a stale element is never returned.
5. **The shared-host test** lives in `AlertDialog.test.tsx` and imports `Dialog` (both in `components/ui/`).
