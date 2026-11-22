# Plan: service-name-link

Branch: feat/service-name-link

- [x] Tooltip wrapper: hover shows `role=tooltip` with content, trigger `aria-describedby` names it, leave hides; Tab focus shows, blur/Esc hides; content `<b>x</b>` literal; child is the trigger (no wrapper element); popup inside portal host. File `frontend/src/components/ui/Tooltip.tsx`, test `Tooltip.test.tsx`.
- [x] Name link: each row's name is a link to `/services/{encoded id}` with name as text, for healthy, unhealthy, paused, TCP (FR-7). File `ServiceRow.tsx`, test `ServiceList.test.tsx`.
- [x] Edit link: `Edit {name}` link, same path, hidden `Edit` label, between Alerts and Delete (FR-7). `ServiceRow.tsx`, `ServiceList.test.tsx`.
- [x] Tab order: name link, Pause/Resume, Alerts, Edit, Delete (NFR-4). `ServiceList.test.tsx`.
- [x] Tooltip on name: hover and keyboard focus show full 90-char name; `<b>x</b>` literal in link and tooltip (NFR-7, FR-9). `ServiceList.test.tsx`.
- [x] Layout CSS: nowrap/ellipsis base, hover underline, colour; wrap in 640px container block. `service-list.css` (checked by reading; not testable in jsdom).
- [x] Changed-on-purpose tests (3) rewritten in `ServiceList.test.tsx`.
- [x] `make check` passes.
- [x] Nothing outside allowed paths changed; package.json and lockfile unchanged.
- [x] Integration tests: not run: no backend code touched, no integration tests apply to this frontend-only task.

## Judgment calls
- Tooltip `aria-describedby` is set only while the popup is open (no dangling reference to an unmounted id); the task says the trigger names the popup, which holds whenever it is shown.
- The popup is controlled with local open state (`open`/`onOpenChange`) in the wrapper to do that.
- Lucide `Pencil` exists under that name in the installed version.
- Ran `npm ci` in `frontend/` (fresh checkout); it did not change package.json or the lockfile.
- Clipping, tooltip position and focus outline were checked by reading the CSS only, not in a browser.
