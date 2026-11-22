# Verifier report: service-name-link

Branch: `verify/service-name-link` (reset onto `feat/service-name-link` at e5793c9; this report is the only commit on top).

**Result: no Blocking findings.**

`make check`: passed (backend lint 0 issues, Go tests, frontend lint, 59 files / 1120 tests, build, contract lint). The fresh checkout needed `npm ci` in `frontend/` first. It left `package.json` and the lockfile untouched.
Integration tests: not run, none apply. No backend code changed and no integration test covers this frontend-only task. No criterion depends only on one.
Live run of the built app: not run. The clipping, the popup position, hover versus focus-visible and the look at 360 px are not proven (jsdom cannot show them).

## Criteria

"Real?" asks whether the test would fail if the behaviour were removed. Yes means I confirmed it by mutation (below) or the assertion is direct.

| Criterion | Test | Real? | Status |
|---|---|---|---|
| Tooltip: hover shows `role=tooltip` with content, trigger `aria-describedby` names it, leave hides | `Tooltip.test.tsx` "opens on hover, is the trigger's description, and closes on leave" | Yes. Removing the role or the describedby fails it | Met |
| Tooltip: Tab focus shows it; blur and Esc hide it | "opens on keyboard focus, and closes on blur and on Esc" | Yes. Removing the role fails it; the assertions are direct | Met |
| Tooltip: content rendered as text (`<b>x</b>`) | "renders the content as text" | Yes. The HTML mutation failed it | Met |
| Tooltip: child is the trigger, no wrapper, popup in the portal host | "makes the child the trigger itself…" | Yes for the wrapper and host assertions, which are direct. Dropping `render` would add a wrapper and fail it (not mutated) | Met |
| Name is a link to `/services/{encoded id}`, text is the name, for healthy, unhealthy, paused and TCP rows (FR-7) | `ServiceList.test.tsx` "every row's name is a link to its Edit path with the id encoded…" (also an id `x/y z`) | Yes. Dropping the encoding failed it | Met |
| `Edit {name}` link, same path, hidden `Edit` label, between Alerts and Delete (FR-7) | "every row has an Edit link to the same path…" | Yes. Pointing it at the alerts path failed it | Met |
| Tab order: name link, Pause or Resume, Alerts, Edit, Delete (NFR-4) | "names every row's button… in the Tab order" (rewritten walk, forward and back across rows) | Yes. `tabIndex={-1}` on Edit failed it | Met |
| Hover and keyboard focus show a tooltip with the full 90-character name; `<b>x</b>` literal in link and tooltip (NFR-7, FR-9) | "hovering or focusing a name link shows a tooltip…" | Yes. Removing the tooltip or rendering HTML failed it. Focus uses `link.focus()`, not Tab; the Tab path is covered in `Tooltip.test.tsx` | Met |
| Changed-on-purpose tests (1) links list and count `1 + 2 × 3`, (2) Tab walk, (3) delivery-link list | the three rewritten cases | Yes. The Edit mutations failed (1) and (2) (the Edit link is in all three) | Met. Nothing loosened: the "no switch", "no Open link" and "no Edit button" assertions remain |
| Ellipsis base rule, wrap in the 640 px container block, `min-width: 0` on the name, four buttons fit | None (CSS, not testable in jsdom) | n/a | Met by reading. `.svc__name` is nowrap and ellipsis, with `min-width: 0` on it, on `.svc__title` and on `.svc__main`. The wrap override is inside the container block, after the base rule. 4 × 30 px plus 3 × 2 px gaps is 126 px, within the 132 px column. Values match `docs/design/dashboard.css` |
| `make check` passes; nothing outside the allowed paths changed; package files unchanged | `make check`; `git diff --name-only` | n/a | Met. Changed files: the plan, `Tooltip.tsx` and its test, `ServiceRow.tsx`, `ServiceList.test.tsx`, `service-list.css` |

## Plan check

- Every criterion has a ticked plan item. None is missing.
- Each ticked test exists and checks its behaviour (see "Real?").
- The plan matches the diff.
- Judgment calls in the plan: `aria-describedby` is set only while the popup is open, through a controlled `open` state. The task asks that the trigger be linked to the popup; that holds whenever the popup exists, so I accept it. It cannot differ from the task in a way a test would show.

## Rule checks

- **Dependencies:** `package.json` and the lockfile are unchanged. `@base-ui/react` is 1.9.0, `lucide-react` is 1.73.0, and `Pencil` exists.
- **Tooltip.tsx:**
  - It is the only importer of `@base-ui/react/tooltip`.
  - It has no `title` attribute and no hand-written popup.
  - The popup is portalled into `getPortalHost()` and has `role="tooltip"`.
  - The text is a React child.
  - Side is bottom, align is start, offset is 6 px (from the board); no hard-coded colour or `z-index`.
- **ServiceRow.tsx:** the name is a text child of a `Link`. `servicePath` is a single helper that the Alerts link derives from. Edit is a link, not a button. No dead control.
- **Layers and conventions:** the diff touches only the allowed paths. No design code was copied (the board's `.svc__title--tip` placement rule was not taken). There are no data, transaction or layer concerns in this change.
- **Hand-written replacements for the component library:** none.

## Mutation checks run (each reverted, tree clean)

| Mutation | Result |
|---|---|
| Drop the id encoding in `servicePath` | Failed 3 tests (name link, Edit link, Alerts link) |
| Point the Edit link at the alerts path | Failed the Edit link test |
| Remove the name's tooltip | Failed the tooltip test |
| Render the tooltip text as HTML | Failed `Tooltip.test` "as text" and the dashboard tooltip test |
| `tabIndex={-1}` on Edit | Failed the Tab-order test |
| Remove `role="tooltip"` | Failed 5 tests |
| Remove `aria-describedby` | Failed the hover test |

## Cases tried

- An id with a space or a slash, in the tests (`x/y z`).
- Esc with the tooltip open, and blur, in the tests.
- **Not tried:** a 200-character name, wide-character-only names, ids with `?` and `#`, and hover followed by Tab. `encodeURIComponent` handles `?` and `#`, and the long-name clip is CSS only. I did not run them.

## Findings

Blocking: none.

Non-blocking:

1. **Test quality.** The dashboard keyboard-focus tooltip case uses `link.focus()` rather than Tab. Matters when: the wrapper changes how it detects keyboard focus (for example, moving to `focus-visible`), because the dashboard test would then not show it. `Tooltip.test.tsx` covers Tab.
2. **UX (a known gap in the task file).** The tooltip is offered on every name, and a screen reader may announce the name twice. Matters when: a screen reader pass happens at the milestone's keyboard check.

## Docs or specs that no longer match

- `STACK.md` records no versions for Base UI or Lucide, and the task changed none. Nothing to adopt.
- `docs/manual-checks.md`: no entry is out of date. The "Keyboard (NFR-4)" focus-mark check and the "Narrow screens" check at 360 px now also apply to the name link and the Edit action; they are due before release, not at this merge.
- `docs/openapi.yaml` and `docs/requirements.md`: unaffected.
