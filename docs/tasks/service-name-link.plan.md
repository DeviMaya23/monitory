# Plan: service-name-link

Branch: feat/service-name-link

- [ ] Tooltip wrapper: hover shows `role=tooltip` with content, trigger `aria-describedby` names it, leave hides; Tab focus shows, blur/Esc hides; content `<b>x</b>` literal; child is the trigger (no wrapper element); popup inside portal host. File `frontend/src/components/ui/Tooltip.tsx`, test `Tooltip.test.tsx`.
- [ ] Name link: each row's name is a link to `/services/{encoded id}` with name as text, for healthy, unhealthy, paused, TCP (FR-7). File `ServiceRow.tsx`, test `ServiceList.test.tsx`.
- [ ] Edit link: `Edit {name}` link, same path, hidden `Edit` label, between Alerts and Delete (FR-7). `ServiceRow.tsx`, `ServiceList.test.tsx`.
- [ ] Tab order: name link, Pause/Resume, Alerts, Edit, Delete (NFR-4). `ServiceList.test.tsx`.
- [ ] Tooltip on name: hover and keyboard focus show full 90-char name; `<b>x</b>` literal in link and tooltip (NFR-7, FR-9). `ServiceList.test.tsx`.
- [ ] Layout CSS: nowrap/ellipsis base, hover underline, colour; wrap in 640px container block. `service-list.css` (checked by reading; not testable in jsdom).
- [ ] Changed-on-purpose tests (3) rewritten in `ServiceList.test.tsx`.
- [ ] `make check` passes.
- [ ] Nothing outside allowed paths changed; package.json and lockfile unchanged.
- [ ] Integration tests: not run: no backend code touched, no integration tests apply to this frontend-only task.

## Judgment calls
