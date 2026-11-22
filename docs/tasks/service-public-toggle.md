# Task: service public page toggle

One frontend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

On the Add and the Edit service screens the admin can choose whether a service is shown on the public page, with the board's "Public page" group and its `Show on public page` switch. A new service starts hidden; an edited service shows its saved choice. The value is sent with `createService` and `updateService` as `shown_on_public_view`. This replaces the Edit form's stop-gap of sending the saved flag back with no control.

Requirements covered:

- FR-27: the admin chooses which services appear on the public view (the switch on each service).
- FR-68: a new service is hidden from the public view; the admin shows it with the toggle.
- FR-7, in part: the saved choice is shown and can be edited like every other setting, and saving an edit no longer restores a value the form does not hold.
- NFR-4, in part: the switch is reachable by Tab in the page's order and operable from the keyboard.

Out of scope:

- **The dashboard's switch for the whole public view** (FR-26): `dashboard-public-switch`.
- **Which services the public page really lists:** decided by the server (`getPublicDashboard`): a paused service is hidden whatever the toggle says (the switch's hint says so); the form does not reflect pausing.
- **Any change to the server, the contract or the design files.**

## Prerequisite

`edit-service-screen` and `service-test-panel` are merged (both change the form's shared files: `ServiceForm.tsx`, `useUpdateService.ts`, `serviceInput.ts`, their tests). The builder checks first that these exist on the default branch, and stops to ask if any is missing or named differently (it never creates them). Names come from those task files where `service-test-panel` was not merged when this was written.

- In `features/service-form/`: `components/ServiceForm.tsx` (the groups in `div.form-main`, then the test panel, then the footer), `AlertsGroup.tsx` (the example of a group with a `Controller` over a `Switch`), `EditServiceForm.tsx`, `AddServiceForm.tsx`; `hooks/useUpdateService.ts` (adds `shown_on_public_view` from the loaded service), `useCreateService.ts`; `lib/formValues.ts` (`ServiceFormValues`, `ADD_DEFAULT_VALUES`), `lib/serviceInput.ts` (`toServiceInput`, `toFormValues`), `lib/formChanged.ts` (`isFormChanged`, a deep comparison of every key), and their tests.
- `components/ui/Switch.tsx` (props `checked`, `onCheckedChange`, `label`, `disabled`, `description`).
- The generated `ServiceInput.shown_on_public_view` (`boolean`, default false) in `lib/api/schema.d.ts`.

`package.json` and the lockfile do not change.

## Role and ownership

Role: Frontend.

You may change `frontend/src/features/service-form/**` and `frontend/src/test/fixtures.ts` (only if a helper is missing). You may not change `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/lib/api/schema.d.ts` (generated), the lint and build configuration under `frontend/`, `frontend/src/styles/components.css`, `frontend/src/components/**`, `frontend/src/lib/**`, `frontend/src/App.tsx`, `frontend/src/App.test.tsx` unless a body assertion needs the new key (see "Tests this task changes on purpose"), `frontend/src/app-shell/**`, `backend/**`, `e2e/**`, or `docs/**` (except your own plan file, `docs/tasks/service-public-toggle.plan.md`). Do not change `features/service-list/**`, `features/alert-list/**` or `features/sign-in/**`.

Shared files this task touches, all owned by this task while it runs: everything under `features/service-form/`; `App.test.tsx` and `test/fixtures.ts` are also edited by `dashboard-public-switch`, in other hunks (this task: the one body assertion; that task: module mocks and the dashboard's controls), so a merge conflict is unlikely, and whichever merges second re-reads them. Tasks that may run at the same time: `dashboard-public-switch` (it touches `features/service-list/`, `components/ui/Switch.tsx`, `lib/api/publicView.ts`; it adds one optional prop to `Switch`, which this task uses as it is) and any backend task. `share-form-parts` waits for this one (it changes the same feature).

## Operations used

From `docs/openapi.yaml`. Types come from `frontend/src/lib/api/schema.d.ts`, never hand-written.

| Operation | Method and path | Responses this screen handles |
|---|---|---|
| `createService` | `POST /api/services` | As the Add screen handles them today; no new status or code. Real on the server |
| `updateService` | `PUT /api/services/{serviceId}` | As the Edit screen handles them today; no new status or code. Real on the server |

`ServiceInput.shown_on_public_view` is an optional boolean, false when omitted (FR-68). `createService` and `updateService` list no field error for it (a boolean cannot be invalid); if the server ever names it, the form's mapping lists the path as plain text in the summary like any unmapped path.

## Behavior

### What exists

- The form's groups end with Alerts. `toServiceInput` never sends `shown_on_public_view`, so a new service is saved hidden (the server's default). The Edit form (`useUpdateService`) sends the loaded service's `shown_on_public_view` (`false` when absent) beside `toServiceInput`'s body so that saving does not change it, because the form has no control for it.
- `isFormChanged` compares every key of the form's values, so a new value is covered once it is in `ServiceFormValues`.

### The group

A `fieldset.group` after the Alerts group (the last group, before the test panel and the footer):

- `legend.group__legend` `Public page`.
- The `Switch` wrapper with the label `Show on public page` and the description `Anyone can see its name, status and last check time. Hidden while paused.`, checked by the form's value `shown_on_public_view`, its On or Off word as the wrapper shows it. It is disabled while a save is in flight (as the Alerts switch is). No error text is shown under it.

The form's value `shown_on_public_view` (boolean) starts at `false` on the Add screen (`ADD_DEFAULT_VALUES`) and at the saved service's value on the Edit screen (`toFormValues`: `false` when the service has none).

### What is sent

`toServiceInput` always sends `shown_on_public_view` with the form's boolean, on create and on update. `useUpdateService` no longer adds the flag itself: the one builder sends it. The body is otherwise as before. A new service saved with the switch untouched is sent `shown_on_public_view: false`, which is what the server defaulted to.

### Leaving without saving

The form counts as changed when the switch differs from where it started (`isFormChanged`, no special code): on the Add screen when it is turned on; on the Edit screen when it differs from the loaded value. Putting it back makes the form unchanged.

### Known gaps

- **The hint says "Anyone can see…" even while the dashboard's public view switch is off:** the board's text, kept as it is; the dashboard's switch is the master.
- **A service paused after loading** still shows its toggle as saved; the hint says paused services are hidden.
- **A saved flag changed in another tab** is overwritten by the next save of the Edit form (as every setting is).

## Structure

By `ARCHITECTURE.md`; follow `AlertsGroup` as the example. Names marked "new" are fixed by this file; others are the builder's choice. One hook per concern; no new hook is needed.

- `features/service-form/lib/formValues.ts` (and tests that build values): `ServiceFormValues` gains `shown_on_public_view: boolean`; `ADD_DEFAULT_VALUES` sets it to `false`.
- `features/service-form/lib/serviceInput.ts` (and test): `toServiceInput` sends it; `toFormValues` reads `service.shown_on_public_view ?? false`. The round trip of `toServiceInput(toFormValues(service))` includes it.
- `features/service-form/hooks/useUpdateService.ts` (and test): the injected flag goes; the hook is `toServiceInput(values)` and `updateService(service.id, …)` only.
- `features/service-form/components/PublicPageGroup.tsx` (new, with a test), or the equivalent: the group; takes `control` and `saving` (as `AlertsGroup` takes them), holds no request logic and no text of its own beyond its constants (the words live in `features/service-form/lib/publicPageGroup.ts`, new, as `lib/alertsGroup.ts` holds the Alerts group's, defined once).
- `features/service-form/components/ServiceForm.tsx`: renders the group after the Alerts group.

## Design reference

Reference only, read-only: `docs/design/service-form.html` (the "Public page" group at the end of "Add service: idle (HTTP)" and "Edit service: every saved value shown (HTTP)") with `docs/design/service-form.css` and `components.css`. Copy values and rules from the styles; never copy board markup or component code. Use the `Switch` wrapper. No stylesheet change is needed (`.group`, `.stack` and `.switch-row` exist).

Texts copied from the board as written: `Public page`, `Show on public page`, `Anyone can see its name, status and last check time. Hidden while paused.`. No text is added.

## Dependencies

None. `package.json` and the lockfile do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Mock `createService`, `updateService` and `getService` at the wrapper boundary with value-return spies typed with the generated types (keep the real query keys), render with `renderRoutes` and a `ToastProvider`, use `user-event`, and use non-default values everywhere.

**`lib/serviceInput.ts`, `useUpdateService`, `lib/formValues.ts`**

- `toServiceInput` of values with `shown_on_public_view: true` sends `true` and of `false` sends `false`, for an HTTP and a TCP form; `toFormValues` of a service with the flag `true`, `false` and absent gives `true`, `false`, `false`; the round trip keeps the flag (FR-27, FR-68).
- `ADD_DEFAULT_VALUES.shown_on_public_view` is `false`.
- `useUpdateService` sends the form's value, not the loaded one: loaded `true`, form turned to `false`, the request has `false`; loaded `false`, form turned on, the request has `true`; the body is exactly `toServiceInput(values)` (nothing is added by the hook).

**The group (`PublicPageGroup.test.tsx`)**

- The legend `Public page` and the switch `Show on public page` with its description show; the switch follows the form's value, toggles it, and is disabled while `saving`.

**The forms (`AddServiceForm.test.tsx` and `EditServiceForm.test.tsx`; `ServiceForm.test.tsx` does not exist and is not created here)**

- Add, idle: the group is the last group, after `Alerts` and before the test panel, the switch is off; saving with it untouched sends `shown_on_public_view: false`; turning it on and saving sends `true` (FR-68, FR-27).
- Edit of a service saved as shown: the switch is on; saving with nothing changed sends `true`; turning it off and saving sends `false`; a service saved as hidden: the switch is off, nothing changed sends `false`, turning it on sends `true` (FR-27, FR-7).
- Leaving: turning the switch on (Add) or changing it from the loaded value (Edit) makes the footer say `Unsaved changes`, Cancel and the back link ask, and the unload prompt is armed; putting it back empties the status and Cancel leaves at once.
- In flight: the switch is disabled while a save is pending and enabled again after a failure.
- Tab order: from the last control of the Alerts group (the Recovery message), Tab goes to the `Show on public page` switch, then to the next control of the page (`Run test`), then `Cancel` (NFR-4); the switch toggles with Space.
- A `422` that names `shown_on_public_view` (not produced by the real server) is listed in the summary as plain text with no link and marks no input; the switch shows no error text under it and toggling it clears nothing.
- A TCP form shows the group too (after Timing and Alerts), and its saved or typed value is sent with the TCP check.

**Repo-wide**

- `make check` passes.
- Nothing outside the allowed paths changed; `package.json` and `package-lock.json` are unchanged.

Tests this task changes on purpose (builder: find the lines, they are listed here by what they assert): every test that asserts a whole request body or the whole of `toFormValues`'s result, with `toEqual` or `toStrictEqual`: in `AddServiceForm.test.tsx` (the full-body `toStrictEqual` cases, three of them), `EditServiceForm.test.tsx`, `useCreateService.test.tsx` (one), `serviceInput.test.ts` (the full-object case of `toFormValues(makeRichService())`, the TCP and absent-flag cases and the round trip) and `App.test.tsx` (the one `createService` `toHaveBeenCalledWith`), now expects `shown_on_public_view` (the form's value); the Edit cases "with nothing changed sends the saved values and `shown_on_public_view` {true,false} as loaded" keep their expectations and now pass through the control instead of the hook; in `useUpdateService.test.tsx` the case "sends the create body and the loaded public flag" is replaced by the one above and the case "sends false when the loaded service has no public flag" is rewritten as "a saved form value is sent as it is" (its premise, an injected flag, no longer exists); the lists of the form's group legends in `AddServiceForm.test.tsx` (the idle list, the `GROUPS` constant and its users, and the TCP list `Service, TCP port, Timing, Alerts`) gain `Public page`; the Add Tab-order case that ends `… Recovery message, Cancel` gains the switch after the Recovery message (and `service-test-panel`'s Tab-order case with a result on screen gains it too); the typed fixtures that build `ServiceFormValues` (`useCreateService.test.tsx`'s `VALUES`, any harness) gain the new key; `formChanged.test.ts` gains a `shown_on_public_view` row in its change table. No other assertion is removed or loosened.

## Verifier checks

- **By reading `serviceInput.ts` and `useUpdateService.ts`:** `shown_on_public_view` is sent from the form's value in one place; the update hook adds nothing; `toFormValues` and `toServiceInput` stay inverses for the flag; nothing else changed in what is sent.
- **By reading the components:** the group is a `fieldset.group` with the `Switch` wrapper; no hand-written switch; the words are defined once, with no change from the board; no literal colour or pixel value; `features/service-form/` imports nothing from `app-shell/` or another feature.
- **Contract:** the key and type match `ServiceInput.shown_on_public_view`; no status or code beyond those the screens already handle.
- **Mutation checks to run:** drop the flag from `toServiceInput`; send the loaded value in the update hook; default the Add form to `true`; read `false` for a saved `true` in `toFormValues`; leave the switch enabled while saving; render the group before the Alerts group; drop the key from `isFormChanged`'s input (by leaving it out of the form's values). Each must fail at least one named test.
- **Inputs to try:** Add with the switch on then off again; Edit of a shown and of a hidden service, switched and switched back; a service with no flag in the answer; saving twice quickly; a `422` on the name together with the switch on.
- **What the verifier cannot prove:** the look at 360 px and the real server's answers; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, the design board or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a shared component or a `components/ui/` change, or an edit to a spec or design file, or a state that is neither drawn on the board nor listed in this file.
- A prerequisite name is missing or differs from "Prerequisite".
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps (the values and the builder first, then the group), push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), that no integration test applies, dependency versions (none changed), and anything you were unsure about. Also list every judgment call this file did not settle, and say that the layout and the focus outline were checked by reading the CSS only, not in a browser, unless you ran the app.
