# Task: service name link and Edit action

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

On the dashboard each row's name becomes a link to the Edit screen, clipped to one line on a wide screen with the full name in a tooltip, and the row gets the board's Edit action beside Pause, Alerts and Delete. A long name can still be read in full (tooltip on hover and on keyboard focus), and the admin reaches Edit by the name or by the action. The tooltip comes from a new shared wrapper over Base UI's Tooltip, which the user approved with this task.

Requirements covered:

- FR-7, in part: the admin can open any service for editing from the dashboard (the edit screen is `edit-service-screen`).
- The board's dashboard states ("List", "Long name: overflow"; no FR names them, FR-9 only lists the services): a long name is clipped on a wide screen and complete in the tooltip and on a narrow one.
- NFR-4, by analogy (it names forms and the delete confirmation; the dashboard board's intro gives the row's Tab order): the name link and the Edit action are reachable by Tab in the board's order, the tooltip opens on keyboard focus too.
- NFR-7: the name is shown as text, also in the tooltip.

Out of scope:

- **The Edit screen** (`edit-service-screen`), the public-page switch and the "Open public page" link (their own tasks).
- **Showing the tooltip only for a clipped name:** the tooltip is available on every name (see "Known gaps").
- **Any other use of the tooltip wrapper** (the board uses tooltips only here).
- **Any change to the server, the contract or the design files.**

## Prerequisite

`dashboard-screen`, `dashboard-pause-resume` and `delete-service-dialog` are merged (the row has Pause, Alerts and Delete). The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `features/service-list/components/ServiceRow.tsx` with the name as `span.svc__name` inside `div.svc__title`, the actions `div.svc__actions` with the Pause or Resume button, the Alerts link, the Delete button (each `btn btn--ghost btn--icon` with `aria-label` `{Action} {name}` and a hidden `span.btn__label`); `features/service-list/service-list.css` with `.svc__name` wrapping at every width.
- `components/ui/portalHost.ts` (`getPortalHost`), `components/ui/Select.tsx` as the example of a wrapper that renders into the host; `.tooltip` in `styles/components.css` (it exists).
- `@base-ui/react` 1.9.0, which has `@base-ui/react/tooltip`.

`package.json` and the lockfile do not change. The route `/services/:serviceId` exists (a placeholder today, the edit screen when `edit-service-screen` merges); this task needs only the path.

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/service-list/**` and `frontend/src/components/ui/` (the new `Tooltip.tsx` and its test only). You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `frontend/src/styles/components.css`, any other file in `components/ui/`, `frontend/src/App.tsx`, `features/service-form/**`, `features/alert-list/**`, `backend/**`, `e2e/**`, or `docs/**` (except your own plan file, `docs/tasks/service-name-link.plan.md`).

Shared files this task touches, owned by this task while it runs: `features/service-list/components/ServiceRow.tsx`, `ServiceList.test.tsx`, `service-list.css`. Tasks that may run at the same time: `edit-service-screen` (it touches `features/service-form/**`, `App.tsx`, `lib/api/services.ts`, nothing here), `toast-text-shared` (it touches only `features/service-list/hooks/` and `lib/`) and any backend task.

## Operations used

None. No request changes.

## Behavior

### What exists

The row's name is a `span.svc__name`, wrapped in full at every width (the board's one-line clip and tooltip were left for this task). The row actions are Pause or Resume, Alerts and Delete. Nothing links to Edit.

### The name link

- The name becomes a `Link` (class `svc__name`) to `/services/{id}` (the id encoded as the Alerts link does). Its text is the name, as text (NFR-7). A paused service's name is the same link.
- **Wide layout** (above the board's 640 px container breakpoint): the name is clipped to one line with an ellipsis (`white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis`), the colour of the text, underlined on hover, as the board draws it. **Narrow layout**: the name wraps in full (`white-space: normal`, `overflow-wrap: anywhere`), as the board's 640 px rules do.
- **Tooltip:** hovering the link or focusing it by keyboard opens a tooltip with the full name, as the board draws it (`.tooltip`, below the name, aligned to its left edge). It closes on leave, blur and Esc. It is the `Tooltip` wrapper (below), not a `title` attribute. Hover opens it after the trigger's delay (Base UI's default); keyboard focus opens it at once.

### The Edit action

A `Link` to `/services/{id}`, in the row actions between Alerts and Delete, in the style of the Alerts link: `btn btn--ghost btn--icon`, Lucide `Pencil`, `aria-label` `Edit {name}`, a hidden `span.btn__label` `Edit`. The Tab order in a row is: name link, Pause or Resume, Alerts, Edit, Delete (and the delivery link where the row has one, where it is today).

### The `Tooltip` wrapper

`components/ui/Tooltip.tsx`, the only file besides the other wrappers that imports Base UI, here its Tooltip (Provider, Root, Trigger, Portal, Positioner, Popup; each `Tooltip` wraps its own Provider, so no hover-skip is shared between rows). Props: `content` (text) and `children` (one element that becomes the trigger through the Trigger's `render` prop, so the link is not wrapped in another element; the child must forward refs and props, as react-router's `Link` does). The popup uses the `.tooltip` rules, renders into `getPortalHost()` like the other popups, is placed on the bottom side with its start edge aligned and a 6 px offset (the board's), and its text is rendered as text. Base UI 1.9.0 puts no role on the popup and no description link on the trigger, so the wrapper adds `role="tooltip"` to the popup and an `aria-describedby` from the trigger to it, as the board draws. The popup is inside the portal host, which already sits above the page and the toast viewport; no `z-index` rule is added (nothing overlaps a tooltip: its trigger is under a modal when a dialog is open). It closes on leave, blur and Esc; the other Base UI defaults stay (the popup stays open while the pointer is on it, a click closes it).

### Known gaps

- **The tooltip is offered on every name,** also when nothing is clipped (and at the narrow layout, where the name is shown in full): knowing whether the text is clipped needs layout measurement that jsdom cannot test. Because the trigger is linked to the popup, a screen reader may hear the name twice (the link and its description).
- **No touch affordance:** a touch screen has no hover; at the narrow layout the name is complete, which is why it wraps there.
- **The Edit screen is a placeholder** until `edit-service-screen` merges.

## Structure

By `ARCHITECTURE.md`; follow `ServiceRow` and the existing wrappers. Names marked "new" are fixed by this file.

- `frontend/src/components/ui/Tooltip.tsx` (new) with a colocated test.
- `features/service-list/components/ServiceRow.tsx`: the name link inside the tooltip, and the Edit action. `service-list.css`: the board's `.svc__name` rules (nowrap, ellipsis, hover underline, text colour) for the wide layout and the existing narrow-layout wrap; values copied from `docs/design/dashboard.css` (the actions column is already 132 px, enough for four buttons, and does not change); the link keeps the board's `color: var(--color-text) !important; text-decoration: none` and underline on hover, because the shell's `.app a` colour rule would otherwise make it accent-coloured; the base rule is nowrap with an ellipsis and the `@container app (max-width: 640px)` block overrides it with the wrap, as the board and the existing stylesheet do; the board's `.svc__title--tip` demo placement rule is not copied (the popup is positioned by the wrapper).
- `features/service-list/components/ServiceList.test.tsx`: the cases listed under "Tests this task changes on purpose".

## Design reference

Reference only, read-only: `docs/design/dashboard.html` (states "List", "Long name: overflow") with `docs/design/dashboard.css` (`.svc__name`, `.svc__title--tip`, the 640 px block) and `docs/design/components.css` (`.tooltip`). Copy values and rules from the styles; never copy board markup or component code. Icons from Lucide only. Where the board and the contract disagree the contract wins.

Texts copied from the board as written: the Edit action's accessible name pattern `Edit {name}` and its hidden label `Edit`. No text is added.

## Dependencies

None. Check that Lucide's `Pencil` exists in 1.73.0 under that name; if not, use the closest and say so in the plan.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Render with a memory router; `user-event`; the service fixtures with a non-default name and id.

**`components/ui/Tooltip.test.tsx`**

- Hovering the trigger shows an element with role `tooltip` holding `content` (wait with `findByRole`: hover opens after a delay; with fake timers advance them), and the trigger's `aria-describedby` names it; leaving it hides it; focusing the trigger by keyboard (Tab) shows it and blur or Esc hides it; the text is rendered as text (content `<b>x</b>` shows literally); the child element is the trigger itself (a link stays one link, no wrapper element is added around it; the `render` prop is used); the popup is inside the portal host.

**The dashboard (`ServiceList.test.tsx`)**

- Each row's name is a link to `/services/{id}` with the id encoded (an id with a space or slash is encoded), its text is the name, for a healthy, an unhealthy, a paused and a TCP row (FR-7).
- Each row has an `Edit {name}` link to the same path, with a hidden `Edit` label, between the Alerts link and the Delete button in document order (FR-7).
- Tab order in a row: name link, Pause, Alerts, Edit, Delete (NFR-4).
- Hovering a name link shows a tooltip with the full name of a 90-character name (this case must not call `row()` or `getByText(name)` while the tooltip is open: the text then appears twice; scope with `within`); focusing it by keyboard shows it too; a name containing `<b>x</b>` shows literally as the link text and in the tooltip (NFR-7, FR-9).

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

Tests this task changes on purpose, all in `ServiceList.test.tsx`: (1) "has a Pause or Resume and a Delete button per row, no Edit button, no switch, Open link or name link; the only links are Add service and one Alerts link per row": renamed; a row's links are now name link, Alerts, Edit (the `aria-label` mapping must give the name link's text, since it has no `aria-label`), the total is `1 + 2 × 3`, the button list is unchanged (Edit is a link), and the assertions that there is no switch and no `Open` link stay. (2) The Tab-order case that walks Resume, Alerts, Delete forward and back across rows (about line 624): every stop and every count of `shift+Tab` is rewritten for the new order, name link, Pause or Resume, Alerts, Edit, Delete, including the walk into the previous row. (3) The delivery-link case that lists a row's links (about line 242): the list becomes name link, delivery link, Alerts, Edit. Cases that read `.svc__name` text stay valid. No other assertion is removed or loosened.

## Verifier checks

- **By reading `Tooltip.tsx`:** only this file imports Base UI's Tooltip; no `title` attribute or hand-written popup; the popup renders into `getPortalHost()`, has `role="tooltip"` and is the trigger's description; no hard-coded colour or pixel value where a token exists, other than values copied from the design CSS.
- **By reading `ServiceRow.tsx`:** the name is a React text child of a `Link`; the id is encoded the same way as the Alerts link's (one helper, not two copies of the path); the Edit action is a link, not a button; no dead control.
- **Layout, by reading the CSS (jsdom cannot prove it):** the ellipsis is the base rule and the wrap is the container-query override at 640 px and below, as the board does; the row's name cell has `min-width: 0` so the ellipsis can work; four action buttons fit their column.
- **Mutation checks to run:** drop the id encoding; point the Edit link at the alert list; remove the name link's tooltip; render the tooltip text as HTML; remove the Edit link from the Tab order by `tabindex="-1"`. Each must fail at least one named test.
- **Inputs to try:** a 200-character name, a name of only wide characters, a name with markup and with spaces, an id with `/`, `?` and `#`; hovering a name, then Tab to the next control; Esc with the tooltip open.
- **What the verifier cannot prove:** the clipping, the popup's position, that hover and focus-visible differ (jsdom treats every focus as focus-visible) and the look at 360 px; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design board or this file conflict with each other.
- You think you need a change outside your paths, a dependency, another `components/ui/` wrapper, or an edit to a spec or design file.
- A prerequisite name is missing, or Base UI's Tooltip is not what "The `Tooltip` wrapper" assumes.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps (the wrapper first, then the row), push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), that no integration test applies, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle, and say that the clipping, the tooltip position and the focus outline were checked by reading the CSS only, not in a browser, unless you ran the app.
