# Verification report: service-form-type-tcp

Branch: `verify/service-form-type-tcp` (reset onto `feat/service-form-type-tcp` at `87c9990`, then one commit of added tests and this report).

**Result: no Blocking findings.** `make check` passes (1113 frontend tests after my 10 added cases, Go lint and tests, builds, contract lint).

Order of work: I opened the plan file in the same command as the diff, before I had mapped the criteria. The "Real?" column and the mutation checks below come from the task file, the tests and running the code, not from the plan's ticks.

## 1. `make check`

Run, passed (twice: on the builder's commit, and after my added tests). The first run failed only because `frontend/node_modules` was missing in this worktree; `npm ci` fixed that and changed no tracked file.

## 2. Acceptance criteria

"Real?" = would the named test fail if the behaviour were removed. "yes (M#)" means I removed the behaviour and watched it fail (section 5).

| # | Criterion | Test(s) | Real? | Status |
|---|---|---|---|---|
| 1 | TCP check for host `db.internal`, port ` 5432 ` is `{type, host, port: 5432}` (FR-49) | `serviceType.test.ts` "sends the host as typed and the port as an integer"; `AddServiceForm.test.tsx` "sends only type, host and port for TCP with an empty URL…" | yes (M2, M3) | met |
| 2 | TCP `check` strictly equals `{type,host,port}` whatever the HTTP groups hold (FR-33) | `useCreateService.test.tsx` "sends exactly type, host and port for a TCP service…" (`toStrictEqual`) | yes (M1) | met |
| 3 | Timing `settings` sent as typed with TCP: 45, 5, 0, 1 (FR-52) | `useCreateService.test.tsx` (same case); `AddServiceForm.test.tsx` "sends the Timing values as typed with a TCP check" | yes in form test (M4 killed it); hook test asserts the same values | met |
| 4 | HTTP request has no `host`/`port` (FR-33) | `useCreateService.test.tsx` "sends no host or port for an HTTP service that has them typed"; form test "sends the HTTP check, with no host or port…" | yes (by reading; not mutated) | met |
| 5 | "Changed": false at start, true for type / host / port (also under HTTP(S)), false when put back | `useLeaveGuard.test.tsx` `it.each` (three rows); form "a typed port counts as changed while HTTP(S) is chosen" | yes (M13, M13b, M13c) | met |
| 6 | Ids, paths, labels: `check.host`, `check.port`, `check.type`, `check.unknown`, `toString` | `fieldLabels.test.ts` (map rows, "maps check.type to Type with no target", "own input ids"); `useServerErrors.test.tsx` "maps the host and the port…" | yes (M11, M11b, M12) | met |
| 7 | `useServerErrors`: clear host only; port only; every `check.` path incl. unknown, keeping name, timing and the two messages; a new response starts clean | `useServerErrors.test.tsx` "clearing the host…", "…the port…", "clearing every check path…" (with `rerender`) | yes (M9 breaks the form-level twin; hook tests assert the exact lists) | met |
| 8 | Idle: Type + hint after Name; HTTP groups; no TCP group, Host or Port | form "shows Type with HTTP(S) chosen and its hint, and the HTTP groups only"; idle "has the Type control and no test button" | yes (by reading; assertions are on presence/absence) | met |
| 9 | Choosing TCP: groups become Service, TCP port, Timing, Alerts; Host/Port empty, Port described by `1 to 65535`; HTTP groups gone; focus stays on radio; Timing/Alerts values kept | form "swaps to the TCP port group, keeps focus on the radio…"; `TcpGroup.test.tsx` "shows an empty Host and Port, with the hint on the port" | yes (M7 hidden-by-CSS, M20 hint link) | met |
| 10 | Keeping values both ways | form "keeps the HTTP values while TCP is chosen and the TCP values while HTTP(S) is chosen"; my "five type switches" case | yes (M8) | met |
| 11 | Send: TCP with empty URL not refused; HTTP again sends HTTP check | form "sends only type, host and port…" and "sends the HTTP check…" | yes (M1, M4) | met |
| 12 | Client check: `''`, `abc`, `1.5`, `-3` show `Enter a whole number.`, focus, nothing sent; edit/type change clears; `0` and `70000` sent; empty host sent (FR-74) | form `it.each` "refuses %j under Port…" (I added `8o`, `9007199254740992`, `9999999999999999999999`); "goes when the port is edited, and when the type is changed"; `it.each(['0','70000'])` | yes (M5, M6, M15) | met |
| 13 | In flight: Type, Host, Port locked, editable after failure | form "locks the Type choice, Host and Port…"; `TypeField.test.tsx` "is locked while saving"; `TcpGroup.test.tsx` "makes both inputs read-only while saving" | yes (M18, M19) | met |
| 14 | `422` host and port: links in order sent, messages under inputs, `aria-invalid`/`aria-describedby`, summary focused, markup as text (NFR-7) | form "lists Host and Port as links…"; my "host with spaces and markup" case | yes (M11, M6) | met |
| 15 | `422` `check.type`: plain text, no link, no input invalid | form "lists check.type as plain text with no link and no input invalid"; `fieldLabels.test.ts` | yes (M12) | met |
| 16 | Focus order follows the page (Port before Timing; URL before Timing after switching back) | form "focuses Port before a bad timing field…", "focuses the URL, not a bad timing field, after choosing TCP and then HTTP(S) again" | yes (M14 killed the first; the second is guarded by the same `shouldFocusError: false` path) | met |
| 17 | Hidden inputs not checked; stale URL/days errors do not return | form "does not check the hidden URL…", "does not check a hidden days field…" | URL: yes (M4, M16). Days: the behaviour is real (M16) but the `values.type === 'tcp'` guard in `HttpsGroup` is not pinned (M17 survived, see finding N1) | met |
| 18 | Clearing: host edit clears host only; port edit port only; type change clears every `check.*`, keeps name and timing; last removal removes summary | form "editing the host clears only its error", "editing the port…", "changing the type clears every check. entry…" | yes (M9, M10) | met |
| 19 | Leaving: TCP / host / port make footer `Unsaved changes`, Cancel asks, unload armed; put back empties | form `it.each` "%s makes the form changed, and putting it back makes it unchanged" (type, host rows) and "a typed port counts as changed…" | yes (M13, M13b, M13c) | met |
| 20 | Tab order: Name, Type (one stop), Method with HTTP; Host, Port, Check interval with TCP (NFR-4) | form "Tab order (NFR-4)" two cases | yes (by reading; real `user.tab`) | met |
| 21 | Replaced tests: idle case, counts 3 groups / 8 radios, `check.type` → `check.unknown`, fixtures | `AddServiceForm.test.tsx` lines ~125 and ~1444, `fieldLabels.test.ts`, `useServerErrors.test.tsx`, `VALUES`, `Harness` | n/a (edits) | met; nothing else loosened (diff read) |
| 22 | `make check` passes; nothing outside allowed paths; `package.json` and lockfile unchanged | `git diff main...HEAD --name-only` | n/a | met (only `features/service-form/**` and the plan file changed) |

Requirement IDs: FR-33, FR-49, FR-52, FR-74, FR-12, NFR-4, NFR-7 are covered by the rows above. FR-49, FR-52 and FR-74 are partial by design (the probe, the edit form and the range check are elsewhere).

## 3. Plan check

Read after the table above was drafted.

- Every criterion in the task file has a ticked item in the plan. None is missing.
- Every ticked item has a test that exists and checks the behaviour (confirmed by mutation for all but the two noted in N1 and N2).
- Differences between plan and diff: none found. The plan's judgment calls match the code (`check.type` is a bare path; validators read `values.type`; `.url-row--host-port` added to `service-form.css`; the Type hint is not `aria-describedby`-linked because `RadioGroup` takes no such prop).
- One plan claim is slightly off: it says the validators for URL and days "read `values.type` instead of relying on unmount: the form library may still validate a registered input that is not rendered". That is true for the URL (registered in `AddServiceForm`, always) and false for days (see N1).
- The plan says the verifier's mutation checks were not run by the builder. I ran them.

## 4. Rule checks (by reading the diff)

- **Dependencies:** none added; `package.json` and `package-lock.json` unchanged; versions pinned as before.
- **Paths:** only `frontend/src/features/service-form/**` and the plan file. `components/**` (including `ui/**`), `styles/components.css`, `schema.d.ts`, `backend/**`, `docs/**` untouched. No import from `features/alert-list`, `service-list` or `sign-in`.
- **Verifier checks in the task file:**
  - TCP `check` has only `type`, `host`, `port` (`tcpCheck`); HTTP request has no new key.
  - URL check is skipped for TCP (`values.type === 'tcp' ||`); the days check guard is present (redundant, N1).
  - Port is the only new client check; the host has none; no range check; server messages are shown as sent (`FieldErrorText` renders text).
  - Hidden groups are not rendered: the conditional returns `TcpGroup` or the HTTP fragment. Values stay (`shouldUnregister` is left at its default; M8 shows the tests notice if it changes).
  - Icons from Lucide only; Base UI is not imported outside `components/ui/`; the `RadioGroup` wrapper is used; no hand-written widget.
  - Strings: `Enter a whole number.` comes from `TIMING_TEXT.notWhole`; the TCP words live in `lib/serviceType.ts`. No literal colour. `140px` is the one literal pixel value, copied from the board as the task says.
  - Keyboard: Name, Type, Method (HTTP) or Host, Port (TCP), then Timing. Every control has a label. Port and Host errors are linked by `aria-describedby`; `check.type` has no input.
  - Contract: the TCP `check` matches `TcpCheck` (`host` string, `port` integer, typed through `ServiceInput`). No new status or code.
- **CONVENTIONS "Forms":** the convention says the client checks only required fields and the URL scheme. The port whole-number check is a client check beyond that, but the task file decides it ("Decisions") and the timing fields already do the same; not a finding.
- **Layer boundaries, data scoping, transactions:** backend not touched; not applicable.
- **Design:** no board markup copied (the CSS is one rule using the board's column values).

## 5. Mutation checks run

Each: break the source, run the named test files, confirm a failure, revert (`git status` clean after each). Script: scratchpad `mut.py`, which restores the file in a `finally`.

| M | Break | Result |
|---|---|---|
| M1 | send `method` with a TCP check | failed (hook test, three form tests) |
| M2 | send the port as text | failed |
| M3 | port not trimmed (`readWholeNumber` trim removed) | failed (TCP send tests, plus the timing ones) |
| M4 | run the URL check for TCP | failed (four send tests) |
| M5 | drop the port check | failed (four refusal rows) |
| M6 | check the host on the client | failed (empty-host sends, summary tests) |
| M7 | render the HTTP groups for TCP, hidden with `hidden` | failed (one test: "swaps to the TCP port group…"). My first attempt did not compile and proved nothing; redone with a valid break |
| M8 | drop values on switch (`shouldUnregister: true`) | failed (many) |
| M9 | leave `check.*` errors after a type change | failed |
| M10 | clear the `name` error on a type change | failed |
| M11, M11b | map `check.port` to the host's input / label | failed |
| M12 | make `check.type` a link | failed |
| M13, M13b, M13c | drop port / host / type from "changed" | failed |
| M14 | let the form library focus the first invalid field | failed |
| M15, M16 | type change does not clear the port error / the URL and days errors | failed |
| M17 | run the days check for TCP | **survived**, see N1 |
| M18, M19, M20 | Type not locked; Port not read-only; Port hint not described | failed |

I also probed M17 harder (make the days validator return an error for TCP): all 28 TCP and hidden-field tests still passed, so an unrendered `HttpsGroup` is never validated.

## 6. Cases beyond the task file

Added as rows or cases in `AddServiceForm.test.tsx` (the existing file, no new test file); all pass against the unchanged source:

- Ports `1`, `65535`, `65536`, ` 80 ` and `00080` are sent as the integers 1, 65535, 65536, 80, 80.
- Ports `8o`, `9007199254740992` and `9999999999999999999999` are refused under Port and nothing is sent.
- A host with spaces and markup (an `<img>` tag with attributes, padded with spaces) is sent as typed, and a `422` message `<b>bad</b> host` is shown as text (no `<b>` element).
- Five type switches with values in both groups keep the URL, host and port, and send the chosen type.

The type switch while a save is in flight is blocked at the control (M18). A `422` with URL, row, host and port errors, then a type switch, is covered by "changing the type clears every check. entry…". Concurrent writes: nothing on this screen writes concurrently; the double-submit guard in `useCreateService` is unchanged.

## 7. Integration tests

Not run: this task changes frontend files only and touches no code that has integration tests. `make check` ran the Go lint and unit tests (0 issues). No criterion depends only on an integration test.

What I cannot prove: the look at 360 px, and the messages of a real server. I did not run the built app; the checks above are unit and component tests in jsdom.

## 8. Findings

### Blocking

None.

### Non-blocking

- **N1 — test quality (redundant guard, not pinned).** `HttpsGroup.tsx` validates days with `values.type === 'tcp' || …`. The form library never validates an unrendered `HttpsGroup`, so removing the guard changes nothing (M17 survived). Matters when: the edit-screen task renders `HttpsGroup` while TCP is chosen, or the form library's handling of unmounted fields changes; until then the guard is dead code. Same shape for the `values.type !== 'tcp'` check inside `TcpGroup`'s port validator (not mutated separately).
- **N2 — test quality.** `TcpGroup.test.tsx:80` waits on a real `setTimeout(…, 0)` to assert that nothing was called. Matters when: the test runs on a very slow machine and the assertion races a later effect (report only: it has a baseline in the same test).
- **N3 — UX.** The Type hint (`Changing type swaps the fields below.`) is not linked to the radio group by `aria-describedby`, because the `RadioGroup` wrapper takes no such prop and the task forbids changing it. Matters when: a screen-reader check of the form is done (milestone 5, NFR-4) or the wrapper is next changed.
- **N4 — decision needed.** Changing the type clears every `check.*` error. The same question is open for the target dialog (`backlog.md`, `target-form-dialog`). Matters when: the user decides the target dialog's answer; the two forms should then agree.

## 9. Docs or specs that no longer match

- `docs/openapi.yaml`, `docs/requirements.md`, `STACK.md`: nothing out of date; no version adopted, no dependency changed.
- `docs/tasks/backlog.md`: line 61 ("Left out of `service-form-type-tcp`: the Type control and the TCP port group on the edit form") stays right until the edit-screen task is drafted. The `target-form-dialog` line about stale entries after a type switch is now answered for the service form (N4); the user may want to record the decision there.
- `docs/design/README.md`: if it lists where the boards differ from what is built, the host-and-port column width (`.url-row--host-port`, 140px) and the summary label `Type` for `check.type` are new differences worth one line. I did not edit it (not my path).
