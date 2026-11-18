# Plan: portal-into-app

Branch: `feat/portal-into-app`

## Checklist

- [ ] `getPortalHost()` twice returns the same element: child of `body`, classes `app portal-host`, attribute `data-portal-host`, exactly one in the document. File `frontend/src/components/ui/portalHost.ts`; test `portalHost.test.ts`.
- [ ] Host removed from the document: next call creates a new one. `portalHost.ts`; test `portalHost.test.ts`.
- [ ] `portalHost.test.ts` removes the host after each test (`afterEach`). Same file.
- [ ] Open `Dialog`: role `dialog` has an ancestor `.app.portal-host`, a child of `body`, outside the test's render container. `Dialog.tsx`; test case in `Dialog.test.tsx`.
- [ ] Same for `AlertDialog` (role `alertdialog`). `AlertDialog.tsx`; case in `AlertDialog.test.tsx`.
- [ ] Same for the open `Select` list (role `listbox`). `Select.tsx`; case in `Select.test.tsx`.
- [ ] A `Dialog` and an `AlertDialog` open as siblings: both in the one host, one host in the document. `AlertDialog.test.tsx` (imports `Dialog`, both are `components/ui/`).
- [ ] Existing tests of the three components pass unchanged; `App.test.tsx` observers are not tripped by the extra empty element (checked by running the whole suite).
- [ ] `components.css`: `.portal-host` rules after the `.app` rule's equal-specificity peers, and `.portal-host *` pointer restoration, beside the dialog and menu layer rules.
- [ ] `make check` passes. Outcome: (to fill)
- [ ] Nothing outside allowed paths changed; `package.json` and lockfile unchanged.
- [ ] Integration tests: not run: no backend or integration-tagged code touched.

## CSS values and why

- `position: fixed; inset: 0` — covers the viewport and is the containing block for the library's fixed layers, so they cover the viewport, not `#root`.
- `min-height: 0; background: transparent` — cancel the `.app` rule's `min-height: 100%` and `background`.
- `pointer-events: none` on the host, `pointer-events: auto` on `.portal-host *` — page stays usable; every library element (including unclassed blockers) takes the pointer back.
- `z-index: 40` — see judgment call 1.
- The rule is placed after the dialog/menu rules, which come after `.app` in the file (order beats equal specificity), with a comment.

## Judgment calls

