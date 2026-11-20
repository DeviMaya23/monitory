# Verification report: service form request rows

Branch: `verify/service-form-request-rows` (built from `feat/service-form-request-rows` at `a576017`; the verifier added tests only, no source change).

**Verdict: no Blocking findings.** `make check` passed (47 test files, 861 tests, plus the verifier's added cases; Go tests, lint, builds, contract lint). Integration tests: not run, none apply (frontend only; `make test-integration` covers the Go mailer). Live run of the built app: no (see "What was not proved").

`make check` history: the first full run failed once on `TargetDialog.test.tsx` "adds a header row… (FR-92)" with a 5000 ms timeout while the machine's load average was 22. The file alone passed (96/96), and a second full `make check` passed. That test already appears in the backlog as a flake (`service-form-alerts` line). I timed it on the base commit and on this branch: 2.8–3.2 s on both, so this change did not slow it.

## Criteria

"Real?" = would the named test fail if the behaviour were removed. Yes = confirmed by a mutation run (M-number, see below) or by reading that the assertion is on the behaviour itself.

### `components/NameValueRows.tsx`

| Criterion | Test | Real? | Result |
|---|---|---|---|
| Every old `HeaderRows` case passes with the dialog's words | `NameValueRows.test.tsx` "with the target dialog's words" (4 old cases plus a next-row focus case); `TargetDialog.test.tsx` unchanged and green | Yes (M13 fails the words tests) | Met |
| `itemName="Query parameter"`: input, Remove, empty text, Add wording, no hint | "names the inputs, Remove, empty text and Add from the props, with no hint" | Yes (M13) | Met |
| `hint` beside Add; group `aria-describedby` names it, and both with a list error | "shows a hint beside Add…", "names only the hint…" | Yes (M16) | Met |
| Row and list errors as text with `aria-invalid` and `aria-describedby`; markup is text (NFR-7) | "NameValueRows errors" (2 tests) | Yes (M13 breaks the row-error test; markup test asserts no element is created) | Met |
| Two instances share no id | "two NameValueRows on one page" | Yes (M15) | Met |
| `.rows__legend` moved, only CSS removed from `alert-list.css`; old file and test deleted | read: diff removes one line from `alert-list.css`, adds one to `components.css`; no `HeaderRows`/`header-rows` left (grep) | n/a (CSS) | Met |

### `lib/requestRows.ts`, `useCreateService`, `useLeaveGuard`

| Criterion | Test | Real? | Result |
|---|---|---|---|
| Arrays in row order, untrimmed, `[]`, empty row as is; body per type; no `body` key for none (FR-35, FR-37) | `requestRows.test.ts` "requestParts"; `useCreateService.test.tsx` "the request rows and body"; form-level "sends the rows in order…" | Yes (M1–M6, M3) | Met |
| "Changed" false at start, true for each of query row, header row, body type, body text with type None; false when put back | `useLeaveGuard.test.tsx` "changed by the request rows and body" (4 tests); form-level "leaving without saving" | Yes (M11a–d, each fails 2 tests) | Met |
| Ids, paths, labels; `fieldLabel` with and without an input; `check.type` and `toString` map to themselves | `requestRows.test.ts` "ids, paths and labels"; `fieldLabels.test.ts` | Yes (M7a, M7b, M14) | Met |

### `useServerErrors`

| Criterion | Test | Real? | Result |
|---|---|---|---|
| Clear a row, a list, all rows of a list, the body content; a new response starts clean | `useServerErrors.test.tsx` "the Request group's rows and body" (5 tests) | Yes (M7b, M10, M18) | Met |

### The form

| Criterion | Test | Real? | Result |
|---|---|---|---|
| Idle state, URL description, empty footer | `AddServiceForm.test.tsx` "idle"; "shows the heading…" | Yes (M12 fails it) | Met |
| Rows: Add focus, names, Remove focus rules, no client limit (NFR-4) | `RequestRowsGroup.test.tsx` "adds a row…", "removes with focus…", "has no limit…" (21 rows) | Yes (M9, M10 fail the first two; the 21-row test would fail on any added cap) | Met |
| Body: shows for JSON/Text/Form with hint, hides for None, text returns | `RequestRowsGroup.test.tsx`; `AddServiceForm.test.tsx` "keeps the body text…" | Yes (M12) | Met |
| Send: empty case, two query rows plus header plus JSON, empty name, none with text, header in full (FR-39) | "sending" (6 tests) | Yes (M1–M6, M19) | Met |
| In flight: read-only and disabled; editable after failure | "locks the rows and the body text…" | Yes (M17) | Met |
| 422 row paths: summary order, links, focus, under inputs, markup as text | "a 422 on rows and the body" test 1 | Yes (M7a, M7b) | Met |
| 422 list paths: under list, plain summary, nothing invalid | test 2 | Yes (asserts no link and no `aria-invalid`) | Met |
| 422 `check.body.type`: plain, no link, nothing invalid | test 3 | Yes (M14) | Met |
| Clearing rules | "clearing a 422" (5 tests) | Yes (M8, M9, M10, M18) | Met |
| 422 `check.url` with a row error, independent | "shows a check.url error and a row error together…" | Yes (M8 fails it) | Met |
| 413 second line | "413: the title and the second line…" | Yes (M20) | Met |
| Leaving | "leaving without saving" (5 rows plus 1 test) | Yes (M11) | Met |
| Tab order | "Tab order (NFR-4)" (3 tests) and the Alerts-group Tab test | Yes (M12 fails two) | Met |
| Replaced tests (the six items) | diff read: each listed item is changed; nothing else loosened (the extra changes the plan lists are consequences of the mandated ones) | n/a | Met |

### Repo-wide

| Criterion | Evidence | Result |
|---|---|---|
| `make check` passes | run twice: first run one load-related timeout in an untouched test, second run green | Met |
| Only allowed paths changed; `package.json` and lockfile unchanged | `git diff 3f05612..HEAD --name-only`: frontend `components/`, `features/service-form`, `features/alert-list` (two files and the deleted pair), `styles/components.css`, `App.test.tsx`, plan file | Met |

### Requirement IDs

| ID | Status | Evidence |
|---|---|---|
| FR-35 (part) | Met | `requestRows.test.ts`, `useCreateService.test.tsx`, form "sending" |
| FR-37 (part) | Met | same, body cases |
| FR-38 (part) | Met | no client limit anywhere (read); "has no limit"; the verifier's 70 000-character body test shows the server's message on the Body |
| FR-12 (part) | Met | "a 422 on rows and the body", "clearing a 422" |
| FR-39 (part) | Met | "shows a header value in full…" (M19), "sends the rows…" |
| NFR-4 (part) | Met | Tab-order tests, focus tests |
| NFR-7 | Met | markup tests in `NameValueRows.test.tsx` and the form; every label is a text node |

## Plan check

Read after the criteria were mapped.

- Every criterion group in the task file has a ticked item in the plan. Nothing is missing.
- Every ticked item has a test that exists and checks the behaviour (confirmed by the mutation runs).
- Differences between plan and diff: the diff also changes `ErrorSummary.tsx` (uses the new `fieldId`) and `TimingGroup.tsx` (`StaticTarget` type). The plan does not mention them. Both are inside the allowed path and behaviour-neutral.
- The plan's judgment calls match the diff (`.stack` wrapper with no new CSS, `check.body.type` has no message under an input, row `value` paths are mapped for query parameters too).

## Rule checks

- **Dependencies:** none added; `package.json` and `package-lock.json` unchanged; no pinned version changed.
- **Layers:** `components/NameValueRows.tsx` imports only React, `lucide-react` and `react-hook-form` types, nothing from `features/`. `features/alert-list` and `features/service-form` both import it; no copy of `HeaderRows` is left. Base UI is imported only under `components/ui/` (grep). Icons from Lucide only.
- **Design reference:** no board markup copied; the row and field markup is built from the existing wrappers and classes. `service-form.css` is unchanged (the board's `.stack` suffices); the new `.rows__legend` is the one moved rule.
- **Hand-written component-library parts:** none. The Body type uses the existing `RadioGroup`; the textarea is a plain element with the `.textarea` class, as the task says.
- **`useCreateService.ts`, `requestRows.ts`, `RequestRowsGroup.tsx`, by reading:** both arrays always sent; `body` absent for `none`; no trim, no dropping of rows, no client limit, no server message rewritten.
- **Words:** each list's words live once in `ROW_LISTS`; labels in `fieldLabels.ts` derive from them. The target dialog passes its own words inline (its legend has the optional mark), unchanged byte for byte.
- **Keyboard, by reading:** DOM order is Name, Method, URL, query rows, header rows, Body type, Body text, timing, alerts, footer. Every input has an accessible name; every error is linked by `aria-describedby`; the summary keeps `tabindex="-1"`.
- **Layout, by reading:** the `.kv` stacked rules at the existing breakpoint apply to the new rows; the Body text sits in `.field` (full width); `.rows__legend` is the only CSS removed from `alert-list.css`.
- **Contract:** the sent `check` matches `ServiceInput.check` for `http` (`query_params`, `headers`, `body`); `tsc` clean; no new status or code handled.
- **Circular imports:** `requestRows.ts` imports only a type from `useCreateService.ts`, so there is no runtime cycle.

## Mutation checks run

All were reverted (`git checkout`); each failed at least one named test.

| # | Mutation | Failed (examples) |
|---|---|---|
| M1 | trim the query rows' name | `requestRows.test.ts`, `useCreateService.test.tsx` (not caught at form level: no spaces typed there) |
| M2 | drop empty header rows | form "sends a row with an empty name as it is…" (not caught by the unit tests, whose empty row is a query row) |
| M3 | send `body` for `none` | 13 tests, among them "sends no body when the type is back on None…" |
| M4 | `body` without `content` | 10+ tests |
| M5 | truncate a header value | `requestRows.test.ts` "sends the rows in order…" |
| M6 | `query_params` only when non-empty | 13 tests |
| M7a | row label off by one | 9+ tests |
| M7b | row index off by one in the path parser | 10+ tests |
| M8 | row error not cleared on edit | 3 tests |
| M9 | list error stays after Add | 2 tests |
| M10 | Remove keeps the rows' errors | 2 tests |
| M11a–d | drop query rows, header rows, body type, body text from "changed" | 2 tests each (unit and form) |
| M12 | Body text shown for `none` | 9 tests |
| M13 | `Header` hardcoded in `NameValueRows` | 6 tests |
| M14 | `check.body.type` becomes a link | 3 tests |
| M15 | list error and hint ids not per instance | "two NameValueRows on one page" |
| M16 | hint not in `aria-describedby` | 5 tests |
| M17 | body textarea not read-only in flight | 2 tests |
| M18 | changing the type clears only the type error | form "choosing another Body type…" |
| M19 | header input masked (`type="password"`) | "shows a header value in full…" |
| M20 | old 413 wording | "413: the title and the second line…" |

## Cases tried beyond the task file

Added as rows or subtests in the existing test files (all pass; no source change was needed):

- `fieldLabels.test.ts`: indexes 10, 19 and 20 (the 21st row) map to `Header 11 name`, `Query parameter 20 name`, `Header 21 value`; near misses (`[01]`, `[-1]`, `[]`, `[1].other`, a bare row path, `check.body`) map to themselves with no input.
- `requestRows.test.ts`: 21 plus 1 rows in order, a name with markup, quotes and spaces, a 5 000-character header value and a 70 000-character body, all sent untouched.
- `AddServiceForm.test.tsx`: a 70 000-character body is sent as typed and the server's message shows on the Body and the text stays; Remove in the query list leaves the headers' and body's errors; Add header removes only its own list error, then Remove clears that list's rows.

Checked by reading: a double submit while saving is blocked by the existing `inFlight` ref; the body text survives the type going to `None` (form state is not unregistered).

## What was not proved

- The look at 360 px, and a real server's limit messages. jsdom cannot show layout, and the screen is tested against mocked responses.
- The built app was not run in a browser by the verifier. The production build in `make check` succeeded.

## Findings

### Blocking

None.

### Non-blocking

1. **Test quality, already in the backlog:** `TargetDialog.test.tsx` "adds a header row… (FR-92)" took 5051 ms and timed out once in a loaded full run. Matters when: CI or a busy machine goes red on an untouched test. It is the same flake as the `service-form-alerts` backlog line; this run is a second sighting, and timing on base and branch is equal.
2. **Cosmetic:** the header comment of `features/service-form/service-form.css` still says "The test panel, rows, segmented-control and counter rules are left out". Rows now exist, though they use `components.css`. Matters when: the edit-screen or test-panel task reads that comment to decide where row CSS lives.
3. **Test quality:** M1 (trim of query rows) and M5 (truncation) are caught only by unit tests, M2 (header rows) only by the form test. The two layers each cover a different half. Matters when: someone builds the request without `requestParts`, such as the edit form; report only until then.
4. **Decision needed:** the plan notes that row paths are mapped for query parameter `value` too, though the server lists only `name`. It is harmless. Matters when: the server starts sending that path. Report only.
5. **Cosmetic:** the plan does not mention the small `ErrorSummary.tsx` and `TimingGroup.tsx` edits (see Plan check).

## Docs or specs that no longer match

- `docs/tasks/backlog.md`: the `add-service-screen` line ("none of the rows below Request") is now out of date for query parameters, headers and the body; the `service-form-request-rows` line (edit form still has no rows) stays true.
- `docs/openapi.yaml`, `docs/requirements.md`: none.
- `STACK.md`: no new or changed dependency, so nothing to record. It lists no `NameValueRows`/`HeaderRows` names.
- `docs/design/README.md`: it already says the limits are deployment configuration. The hints `Up to 20.` and `Up to 64 KB, …` on the board differ from the app on purpose (task Decisions).
- Versions adopted: none.
