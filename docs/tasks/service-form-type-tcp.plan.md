# Plan: service form type switch and TCP fields

Branch: `feat/service-form-type-tcp`. Prerequisite (`service-form-json-and-cert-rows`, #45) is on `main` and merged into this branch.
All paths are under `frontend/src/features/service-form/`.

## lib/serviceType.ts, useCreateService, useLeaveGuard

- [ ] TCP check built from host and port; `check` equals `{ type, host, port }` exactly for TCP; Timing `settings` sent as typed; HTTP request has no `host`/`port` (FR-33, FR-49, FR-52) — `lib/serviceType.ts` + `serviceType.test.ts`, `hooks/useCreateService.ts` + `useCreateService.test.tsx`
- [ ] "Changed": false at start; true with type tcp / host / port (also under HTTP); false again when put back — `hooks/useLeaveGuard.ts` + `useLeaveGuard.test.tsx`
- [ ] Ids, paths, labels: `check.host`, `check.port` map to `Host`/`Port` with inputs; `check.type` -> `Type`, no input; `check.unknown`, `toString` map to themselves — `lib/fieldLabels.ts`, `lib/fieldIds.ts` + `fieldLabels.test.ts`

## useServerErrors

- [ ] Clear host only; port only; every `check.` path (incl. unknown) while `name`, timing and the two messages stay; a new response starts clean — `hooks/useServerErrors.ts` + `useServerErrors.test.tsx`

## The form (AddServiceForm.test.tsx, TypeField.test.tsx, TcpGroup.test.tsx)

- [ ] Idle: Type with HTTP(S) chosen + hint after Name; HTTP groups only, no Host/Port — `components/TypeField.tsx`, `AddServiceForm.test.tsx`, `TypeField.test.tsx`
- [ ] Choosing TCP: groups Service, TCP port, Timing, Alerts; Host/Port empty, Port described by `1 to 65535`; HTTP groups gone; focus stays on radio; Timing/Alerts values kept — `components/TcpGroup.tsx`, `AddServiceForm.test.tsx`, `TcpGroup.test.tsx`
- [ ] Keeping values both ways across type switches — `AddServiceForm.test.tsx`
- [ ] Send: TCP request with empty URL not refused; HTTP again sends HTTP check — `AddServiceForm.test.tsx`
- [ ] Client port check (`''`, `abc`, `1.5`, `-3` refused with `Enter a whole number.`; `0`, `70000`, empty host sent; edit/type change clears) — `AddServiceForm.tsx`, `AddServiceForm.test.tsx`
- [ ] In flight: Type, Host, Port locked, editable after failure — `AddServiceForm.test.tsx`
- [ ] 422 with `check.host`/`check.port`: summary links, field messages, aria, markup as text — `AddServiceForm.test.tsx`
- [ ] 422 with `check.type`: plain text, no link, nothing invalid — `AddServiceForm.test.tsx`
- [ ] Focus order follows the page (Port before Timing; URL before Timing after switching back) — `AddServiceForm.tsx` (shouldFocusError off, focus first invalid by document order), `AddServiceForm.test.tsx`
- [ ] Hidden inputs not checked; stale URL/days client errors cleared on type change — `AddServiceForm.test.tsx`
- [ ] Clearing: host edit, port edit, type change clears `check.*` only, summary disappears at last removal — `AddServiceForm.test.tsx`
- [ ] Leaving: Unsaved changes / Cancel dialog / unload prompt for type, host, port — `AddServiceForm.test.tsx`
- [ ] Tab order: Name, Type, Method (HTTP) / Host, Port, Check interval (TCP) (NFR-4) — `AddServiceForm.test.tsx`
- [ ] Replaced tests: idle "no Type control" case, radio counts (3 groups, 8 radios), `check.type` -> `check.unknown` as unmapped path, fixtures (`VALUES`, `Harness`) — the test files named in the task

## Repo-wide

- [ ] `make check` passes
- [ ] Nothing outside allowed paths changed; `package.json` / lockfile unchanged
- [ ] Integration tests: not run: task touches no code with integration tests (frontend only)
