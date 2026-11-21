# Verification report: service form JSON rules and certificate options

Branch: `verify/service-form-json-and-cert-rows` (built on `feat/service-form-json-and-cert-rows`, commit `33b2a0e`).
Result: **no Blocking findings.** Integration tests: **not run: frontend-only task, no Go code or integration tests touched** (none exist for this code).

## 1. `make check`

`make check` ran twice and failed both times in the same place; lint, `openapi-lint` and `make build` pass (build run on its own).

- The one failure is `features/alert-list/components/TargetDialog.test.tsx` "adds a header row … has no limit (FR-92)": `Test timed out in 5000ms` while the whole suite runs in parallel. The file is not in this diff. Run alone it passes (96/96, 38 s). This is the flake the task names as `target-dialog-test-flake`. All other tests pass (1021 of 1022). Treated as Non-blocking N1, not as a failure of this work.
- `npm ci` was needed first (fresh checkout).

## 2. Acceptance criteria

"Real?": yes = the named test fails when the behavior is removed (mutation number in section 5 where I ran it); read = judged by reading only.

| Criterion | Test | Real? | Status |
|---|---|---|---|
| Rules → `json_rules` in order, untrimmed, `''`, booleans, `[]`, mode passes (FR-44, FR-47) | `jsonRules.test.ts` "sends the text untrimmed…", "sends no rules…" | yes (M1, M2) | Met |
| `certificate_check` off with days text / on with `' 30 '`; ignore boolean (FR-34, FR-50, FR-64) | `certificateOptions.test.ts` (2 cases) | yes (M3, M4) | Met |
| `startsWithHttps` for the listed URLs | `certificateOptions.test.ts` `it.each` ×2 | yes (M7) | Met |
| Ids, paths, labels, input or none (FR-12, FR-46) | `jsonRules.test.ts` "rule ids and paths", `fieldLabels.test.ts` "rules and certificate options" | yes (M8, M9) | Met |
| `useServerErrors` clearing: field, failing value, all rules, days, URL group, new response (FR-12, FR-74) | `useServerErrors.test.tsx` "the rules and the certificate options" (9 cases) | yes (M11, M12, M22) | Met |
| Defaults carry the four keys; two rules + `all` + switch + `45` (FR-44, FR-47, FR-34, FR-50, FR-64) | `useCreateService.test.tsx` "sends the rules, the mode…", the updated 201 cases | yes (M3, M4) | Met |
| "Changed" for rule, mode, switch, ignore, `14 `, `7`, and back | `useLeaveGuard.test.tsx` `it.each` cases | yes (M15–M17) | Met |
| Idle view: order, texts, note, switches off/disabled, days 14, empty footer (FR-44, FR-47, FR-74) | `AddServiceForm.test.tsx` "idle", `HealthRulesGroup.test.tsx` first case, `HttpsGroup.test.tsx` first case | yes (M6 fails 4 idle/HTTPS cases) | Met |
| Rules: Add focus, kind Text, `true` replaces text, text kept, Remove focus ×3, 21 rules (NFR-4) | `HealthRulesGroup.test.tsx`, `useRowFocus.test.tsx` | yes (M14, M20, M24) | Met |
| Send Text/false/true + `all`; empty path sent | `AddServiceForm.test.tsx` "sends Text, false and true rules…" | yes (M1, M2) | Met |
| HTTPS enabled/disabled by URL, `HTTPS://` counts; switch enables days and keeps text (FR-74, FR-50) | `HttpsGroup.test.tsx`, `AddServiceForm.test.tsx` "the HTTPS options and the URL" | yes (M6, M7) | Met |
| URL change turns both switches off, retyping leaves off; https→https leaves on (FR-74) | `AddServiceForm.test.tsx` (3 cases incl. character-by-character) | yes (M5) | Met |
| Days kept while off are sent when turned on again | `AddServiceForm.test.tsx` "keeps the days text while the switch is off…" | yes (M4 fails it) | Met |
| Send `45`, ignore on, off + `abc` → `{ enabled: false }`, no client error | `AddServiceForm.test.tsx` (2 cases) | yes (M3, M23) | Met |
| Client check `''`, `abc`, `1.5`, `-3`; first invalid field; clears on edit/off/URL; `0` sent | `AddServiceForm.test.tsx` "the client check of the days" | yes (M13, M21, M23) | Met. I added boundary rows (below) |
| In flight: read-only, disabled, released after failure | `AddServiceForm.test.tsx` "in flight", `HealthRulesGroup.test.tsx`, `HttpsGroup.test.tsx` | read: the case loops over every control; not mutated | Met |
| 422 rule rows: order, links, aria, focus, markup as text (FR-12, NFR-7) | `AddServiceForm.test.tsx` "on two rules…" | yes (M8–M10) | Met |
| 422 list: under rows, plain-text summary, nothing invalid | "on the list shows the message…" | yes (M18) | Met |
| 422 days (link) and the two switches (plain text) (FR-74) | "on the days…", "on the two switches…" | read; the days link is mapped through `FIELD_IDS` (M8 style) | Met |
| 422 mode: plain text, no link | "on the mode lists it as plain text…" | yes (M19) | Met |
| Clearing (path, kind/text, Add, Remove, mode, switches, URL, last removal) | "clearing the errors" (10 cases) | yes (M10–M13, M22) | Met |
| `check.url` and rule error together | "shows a check.url error and a rule error together…" | read | Met |
| Leaving: status, Cancel dialog, unload prompt, putting back | "leaving without saving" | yes (M15–M17) | Met |
| Time: bulk adds with `fireEvent`, cases near 1 s | `HealthRulesGroup.test.tsx` 21 rules uses `fireEvent` | – | Partly met: see N2 (two cases carry a 15 s timeout) |
| Tab order | `AddServiceForm.test.tsx` "Tab order (NFR-4)" (3 cases) + the replaced stop counts | read; fails under M6 (days/switch stops change) | Met |
| Replaced-on-purpose tests (check body ×3 files, legends, stop counts, radio/button counts, fixtures) | `AddServiceForm.test.tsx`, `useCreateService.test.tsx`, `App.test.tsx`, `useLeaveGuard.test.tsx` Harness | read (diff matches the list; no other assertion loosened) | Met |
| `make check` passes | – | – | Partly met: one unrelated flake under load (N1); everything else passes |
| Nothing outside allowed paths; `package.json`/lockfile unchanged | `git diff main...HEAD --name-only` | – | Met (only `service-form/**`, `App.test.tsx`, the plan) |

### Tests I added (existing file, table rows)

In `AddServiceForm.test.tsx`, "the client check of the days": the refusals now also cover `9007199254740992` (one over `MAX_SAFE_INTEGER`), a 20-digit number, `1e3` and `+5`; a new `it.each` sends `1`, ` 7 ` and `9007199254740991` (the exact limit) as whole numbers. All pass; the limit is exact, with no off-by-one.

## 3. Plan check

Every criterion in the task file appears in the plan, and every ticked item has a test that checks the behavior. Differences between the plan and the diff:

- The plan says `make check`: "run, passed". Not true on this machine under full parallel load (N1).
- The plan records the two 15 s timeouts as a judgment call; the task asks for cases near 1 s (N2).
- The plan lists judgment calls (switch error ids, `clip-path` in the hidden label, `{ enabled: true }` when the reader returns null) that match the code. No unlisted departure found.

## 4. Rule checks

- **Dependencies:** none added; `package.json` and the lockfile unchanged. Lucide, react-hook-form and `components/ui` wrappers only; no Base UI import outside `components/ui/`.
- **Layering:** no import from `features/alert-list`, `service-list` or `sign-in`; `components/**` and `styles/**` unchanged; no server or contract change.
- **What is sent:** all four keys always present; booleans for `true`/`false`; text untrimmed; `certificate_check` has no days while off; the only client check is the days' whole number while the switch is on; no limit, minimum or rule count on the client; server messages shown as received.
- **URL handler:** the switches are turned off in the URL field's `onChange` through `setValue`, not in an effect, and only when the new URL is not `https://`.
- **Keyboard (read):** order matches the task (rules path, kind, text, Remove, Add rule, mode, expiry, days, ignore, timing). Every control has an accessible name. Rule-path, kind and days errors use `aria-describedby`; the list, mode and switch errors do not, as the task says. The summary keeps `tabindex="-1"`.
- **CSS (read, jsdom cannot prove it):** `.rules-row` is four columns (`3fr 120px 2fr` plus the control height) and stacks at the 640 px container width. The hidden label rule has the same declarations as `.sr-only`. `.sub-switch` has a 40 px indent and none at the compact width. Values are copied from the board; tokens are used where they exist.
- **Contract:** the keys and types match `ServiceInput.check` for `http`; no new status or code.
- **Hand-written widgets:** none. Select, RadioGroup and Switch are the wrappers.

## 5. Mutation checks run

Each mutation broke the source, I ran `vitest` over `src/features/service-form` and `App.test.tsx`, then reverted. Every one failed at least one test.

| # | Mutation | Failing tests |
|---|---|---|
| M1 | trim the failing text | 2 |
| M2 | send `'true'` as a string | 4 |
| M3 | send days while the switch is off | 13 |
| M4 | send days as text | 6 |
| M5 | skip the URL change's switch reset | 2 |
| M6 | expiry and ignore switches enabled for `http://` | 11 |
| M7 | `HTTPS://` not counted | 3 |
| M8 | rule id off by one | 3 |
| M9 | rule label off by one | 31 |
| M10 | leave the rule error after editing the path | 4 |
| M11 | keep stale rule errors on Remove | 2 |
| M12 | days error stays when the switch goes off (server) | 2 |
| M13 | days error stays when the switch goes off (client) | 1 |
| M14 | show the text input for `true` | 1 |
| M15 | drop the days from "changed" | 3 |
| M16 | drop the mode from "changed" | 2 |
| M17 | drop the ignore switch from "changed" | 1 |
| M18 | list error becomes a link | 3 |
| M19 | mode error becomes a link | 3 |
| M20 | refuse the 21st rule on the client | 1 |
| M21 | URL edit keeps the days error | 1 |
| M22 | URL edit keeps the `requires_https_url` errors | 2 |
| M23 | validate the days while the switch is off | 1 |
| M24 | Remove focuses the wrong row | 1 |

The switches' error ids and the in-flight lock were checked by reading, not mutated.

## 6. Findings

### Blocking

None.

### Non-blocking

- **N1. `make check` fails on the full parallel run in an unrelated file** (category: test quality). `TargetDialog.test.tsx` times out at 5 s under load; it passes alone. Matters when: CI or a verifier runs `make check` on a loaded machine and the pull request shows a red test it did not cause (the task `target-dialog-test-flake` exists for it).
- **N2. Two form cases carry a 15 s timeout** (category: test quality). The task asked for cases near 1 s; the builder raised the limit instead of shortening them (`AddServiceForm.test.tsx` lines ~1960 and ~1971). Matters when: the file's total time grows enough that the slow cases become the flake, as in N1.
- **N3. The days input is disabled by the DOM attribute, so a native-field read of it (not the form state) would see nothing; not verified against the library** (category: latent bug). Today nothing reads it that way: submit uses the form state and the test "keeps the days text while the switch is off" proves it. Matters when: a later task (edit form, test panel) reads the days with `getValues` or `getFieldState` while the switch is off.

Limits of this verification: the look at 360 px and a real server's limit messages (rule count, minimum days) cannot be proven in jsdom; I did not run the built app in a browser. The 0, 1, 10 and 11 rule counts have no client check, so they are the server's to refuse (read).

## 7. Docs or specs that no longer match

- `docs/design/README.md`: the "Differences from the board" table does not list that the mode choice is the segmented `RadioGroup` (not stacked plain radios), that the rule kind's visible label is hidden, that the HTTPS switches turn off when the URL stops being `https://`, or that the days field is `disabled` with its text kept. The task says the user may add them.
- `docs/tasks/backlog.md`: already records the edit-form groups and the duplicate `useRowFocus` effect; no change needed.
- `docs/openapi.yaml`, `docs/requirements.md`: no mismatch found.
- `STACK.md`: no version adopted by this work (no dependency change).
