# Plan: service form type switch and TCP fields

Branch: `feat/service-form-type-tcp`. Prerequisite (`service-form-json-and-cert-rows`, #45) is on `main` and merged into this branch.
All paths are under `frontend/src/features/service-form/`.

## lib/serviceType.ts, useCreateService, useLeaveGuard

- [x] TCP check built from host and port; `check` equals `{ type, host, port }` exactly for TCP; Timing `settings` sent as typed; HTTP request has no `host`/`port` (FR-33, FR-49, FR-52) — `lib/serviceType.ts` + `serviceType.test.ts`, `hooks/useCreateService.ts` + `useCreateService.test.tsx`
- [x] "Changed": false at start; true with type tcp / host / port (also under HTTP); false again when put back — `hooks/useLeaveGuard.ts` + `useLeaveGuard.test.tsx`
- [x] Ids, paths, labels: `check.host`, `check.port` map to `Host`/`Port` with inputs; `check.type` -> `Type`, no input; `check.unknown`, `toString` map to themselves — `lib/fieldLabels.ts`, `lib/fieldIds.ts` + `fieldLabels.test.ts`

## useServerErrors

- [x] Clear host only; port only; every `check.` path (incl. unknown) while `name`, timing and the two messages stay; a new response starts clean — `hooks/useServerErrors.ts` + `useServerErrors.test.tsx`

## The form (AddServiceForm.test.tsx, TypeField.test.tsx, TcpGroup.test.tsx)

- [x] Idle: Type with HTTP(S) chosen + hint after Name; HTTP groups only, no Host/Port — `components/TypeField.tsx`, `AddServiceForm.test.tsx`, `TypeField.test.tsx`
- [x] Choosing TCP: groups Service, TCP port, Timing, Alerts; Host/Port empty, Port described by `1 to 65535`; HTTP groups gone; focus stays on radio; Timing/Alerts values kept — `components/TcpGroup.tsx`, `AddServiceForm.test.tsx`, `TcpGroup.test.tsx`
- [x] Keeping values both ways across type switches — `AddServiceForm.test.tsx`
- [x] Send: TCP request with empty URL not refused; HTTP again sends HTTP check — `AddServiceForm.test.tsx`
- [x] Client port check (`''`, `abc`, `1.5`, `-3` refused with `Enter a whole number.`; `0`, `70000`, empty host sent; edit/type change clears) — `AddServiceForm.tsx`, `AddServiceForm.test.tsx`
- [x] In flight: Type, Host, Port locked, editable after failure — `AddServiceForm.test.tsx`
- [x] 422 with `check.host`/`check.port`: summary links, field messages, aria, markup as text — `AddServiceForm.test.tsx`
- [x] 422 with `check.type`: plain text, no link, nothing invalid — `AddServiceForm.test.tsx`
- [x] Focus order follows the page (Port before Timing; URL before Timing after switching back) — `AddServiceForm.tsx` (shouldFocusError off, focus first invalid by document order), `AddServiceForm.test.tsx`
- [x] Hidden inputs not checked; stale URL/days client errors cleared on type change — `AddServiceForm.test.tsx`
- [x] Clearing: host edit, port edit, type change clears `check.*` only, summary disappears at last removal — `AddServiceForm.test.tsx`
- [x] Leaving: Unsaved changes / Cancel dialog / unload prompt for type, host, port — `AddServiceForm.test.tsx`
- [x] Tab order: Name, Type, Method (HTTP) / Host, Port, Check interval (TCP) (NFR-4) — `AddServiceForm.test.tsx`
- [x] Replaced tests: idle "no Type control" case, radio counts (3 groups, 8 radios), `check.type` -> `check.unknown` as unmapped path, fixtures (`VALUES`, `Harness`) — the test files named in the task

## Repo-wide

- [x] `make check` passes
- [x] Nothing outside allowed paths changed; `package.json` / lockfile unchanged
- [x] Integration tests: not run: the task touches no code with integration tests (frontend only)

## Judgment calls

- `check.type` is mapped as a bare path (label `Type`, no input), next to the other paths with no input, so the summary shows it as plain text.
- Validators for the URL and the days read `values.type` instead of relying on unmount: the form library may still validate a registered input that is not rendered, so the check is explicit.
- Focus on a failed client check: `shouldFocusError` is off and the `ref`s in the errors tree are sorted by document position; this covers every field with a client check, old and new.
- A type change clears the client errors of URL, days and port, plus every `check.*` server error; the name and timing errors stay.
- `TypeField` and `TcpGroup` take their messages and clear callbacks as props, like `TimingGroup`; the Type hint is not linked with `aria-describedby` (the `RadioGroup` wrapper takes no such prop and I may not change it).
- `.url-row--host-port` was added to `service-form.css` for the 140px Port column; the existing compact-width rule stacks it.
- Test fixtures: the existing AddServiceForm tests were left as they were except the four replaced ones named in the task (Type control idle case, radio count 6 to 8, two `check.type` cases to `check.unknown`).
- Mutation checks from the verifier's list were not run by me.
