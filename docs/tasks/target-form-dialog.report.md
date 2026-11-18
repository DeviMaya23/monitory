# Verification report: target form dialog

Verifier branch: `verify/target-form-dialog` (the builder's work, `feat/target-form-dialog` at `70590f0`, plus the two tests the verifier added to `TargetDialog.test.tsx`).

**Result: no Blocking findings.** `make check`: run, passed (36 test files, 520 tests on the builder's commit; 525 tests with the five rows the verifier added; lint, `tsc -b`, build and `go build` included). Integration tests: not run, because the task changes only `frontend/src/` and no criterion depends on one (see "Integration tests").

## Criteria

"Real?" says whether the named test would fail if the behavior were removed. "Yes (M#)" means a mutation check confirmed it (table below); "yes, by reading" means the assertion clearly depends on the behavior but no mutation was run.

| # | Criterion | Test | Real? | Verdict |
|---|---|---|---|---|
| 1 | `createTarget`/`updateTarget`: method, path, ids encoded, rejection unchanged (NFR-8) | `lib/api/targets.test.ts` > createTarget, updateTarget | yes, by reading (asserts the exact `apiRequest` args) | Met |
| 2 | `RadioGroup`: named radiogroup, checked option, click and arrow change once, Tab once, `disabled`, text and icon | `RadioGroup.test.tsx` (4 tests) | yes, by reading | Met |
| 3 | `Dialog` props: `showClose` (not while busy, absent without), `sheet` classes, `finalFocus` | `Dialog.test.tsx` > Dialog added props | yes (M12, M25) | Met |
| 4 | `useTargetDialog`: modes, snapshot, close | `useTargetDialog.test.tsx` | yes, by reading | Met |
| 5 | `useSaveTarget` 201/200: args, append last, replace in place, `dataUpdatedAt` kept, no refetch, toasts, no list created, in-flight list cancelled, works after unmount (FR-14, FR-15) | `useSaveTarget.test.tsx` > a success | yes (M1, M2, M14, M15); the unmount case by reading | Met |
| 6 | `useSaveTarget` failures: six kinds, 401 none, no toast or cache change, one submit, new object each time | `useSaveTarget.test.tsx` > a failure is a value, in flight | yes (M3, M10, M23, M28) | Met |
| 7 | `useTargetServerErrors`: `errorFor`, `clearField`, `clearField('headers')`, `clearHeaders`, reset per response | `useTargetServerErrors.test.tsx` | yes (M7) | Met |
| 8 | `useTargetLeaveGuard`: changed rules, `beforeunload` only while changed and not saving | `useTargetLeaveGuard.test.tsx` | yes (M11, M17) | Met |
| 9 | `targetFields`: path to label and input, no input for `type` and unknown paths, limit 50 | `targetFields.test.ts` | yes (M8) | Met |
| 10 | Add dialog: title, Email chosen, Name focused, `0/50`, `12/50`, `maxlength` 50, Close, footer, no test row (FR-14, FR-80, FR-81) | `TargetDialog.test.tsx` > shows the board's form, counts the typed characters | yes (M8 breaks it) | Met |
| 11 | Webhook switch: fields shown and hidden, values kept per type, only the active type sent, `name` as typed, `headers: []` | `TargetDialog.test.tsx` > the form (first two tests); `targetForm.test.ts` | yes (M5, M6) | Met |
| 12 | `http://` warning for `http://x`, `HTTP://x` after two spaces; not for `https://x`, `http:/`, empty; save still sent (FR-100) | `TargetDialog.test.tsx` > the http:// warning (it.each); `targetForm.test.ts` | yes (M4, M13) | Met |
| 13 | Header rows: add and focus, names by number, renumber, focus rules, order, empty row sent, no limit (FR-92) | `TargetDialog.test.tsx` > adds a header row...; > focuses the previous row...; `HeaderRows.test.tsx` | yes (M16) | Met |
| 14 | Client checks: empty or blank address and URL, nothing sent, focus, cleared on edit | `TargetDialog.test.tsx` > shows the client message... | Empty: yes. Blank: **no** (M19 survived): see finding N1 | Met (the blank case cannot occur, see N1) |
| 15 | `<b>x</b>` as text in dialog, row, button names (NFR-7) | `TargetDialog.test.tsx` > shows names, addresses, URLs... as text | yes, by reading (asserts no `b` element; no `dangerouslySetInnerHTML` in the diff) | Met |
| 16 | Enter in Name submits once; Enter while saving sends nothing (NFR-4) | `TargetDialog.test.tsx` > submits once on Enter; verifier's "two submits in the same tick" | yes (M23). The `if (saving) return` in `onSubmit` is redundant: M24 survived because `useSaveTarget` guards too | Met |
| 17 | `No custom headers.` shows and goes | `TargetDialog.test.tsx` > shows No custom headers. | yes, by reading | Met |
| 18 | `Edit {name or address}` labels, footer hint, no Add target when not loaded, loading or service gone | `AlertList.test.tsx` (new cases) | yes, by reading | Met |
| 19 | Opening Add or Edit closes an open removal question, nothing sent | `TargetDialog.test.tsx` > opening while a removal question is open | yes (M26) | Met |
| 20 | Saving state: disabled, `aria-busy`, `Saving…`, spinner, Cancel, Close, Esc and backdrop inert, inputs read-only, one submit | `TargetDialog.test.tsx` > while pending | yes (M22, M12) | Met |
| 21 | 201 and 200 end to end: closes, row last or in place, count, toast, focus rules, `name: ''` gives `Unnamed` (FR-14, FR-15, FR-80) | `TargetDialog.test.tsx` > saving (4 tests) | yes (M14, M15, M33) | Met |
| 22 | A refresh with other values for the edited target leaves the dialog alone | `TargetDialog.test.tsx` > leaves the dialog's values alone | yes, by reading (the snapshot is held in `useTargetDialog` state); no mutation applies cleanly | Met |
| 23 | 422: summary count and entries, focus, field messages, links, plain entries, clearing, first of two (FR-82, FR-87, FR-89, FR-110, FR-92) | `TargetDialog.test.tsx` > 422 shows the summary..., a single error... | yes (M7, M21) | Met |
| 24 | 409 `target_duplicate`: message on the field, focus, no banner, on add and edit; editing clears (FR-88) | `TargetDialog.test.tsx` > 409 target_duplicate (add: email and webhook; edit: email; the verifier added edit: webhook) | yes (M9, M20) | Met |
| 25 | 409 `alert_list_full`: banner, focus on primary, values stay, dialog stays (FR-19) | `TargetDialog.test.tsx` > 409 alert_list_full | yes (M28) | Met |
| 26 | 404 on add (closes, refetches, "service not found" focus); 404 on edit (banner, Save enabled, Close and refresh) | `TargetDialog.test.tsx` > 404 on an add (two tests), 404 on an edit | yes (M30) | Met |
| 27 | The next submit clears the previous banner and summary; second failure replaces the first; 409 other code, 422 without errors, `alert_list_full` on edit show `Something went wrong.` | `TargetDialog.test.tsx` > the next submit clears...; it.each; alert_list_full on an edit | The "clears" test was not real for the client-check path (M29 survived); the verifier added a row that kills it. Others yes (M3) | Met |
| 28 | 422 with path `headers`: summary, message under rows, Add header clears, removing a row clears all | `TargetDialog.test.tsx` > a 422 with the path headers... | yes (M7) | Met |
| 29 | Esc on the discard question closes only the question | `TargetDialog.test.tsx` > a changed one asks first... | yes, by reading (asserts the form's values and dialog remain) | Met |
| 30 | 403 `csrf_failed` Reload; 500 and network error `Try again` resends (NFR-8) | `TargetDialog.test.tsx` > 403 csrf_failed; it.each 500 and network | yes (M31) | Met |
| 31 | 401: sign-in form, no toast, no banner | `TargetDialog.test.tsx` > a 401 shows the sign-in form... | yes (M10 at hook level) | Met |
| 32 | Leaving: unchanged closes on four exits with focus; changed asks with focus on Keep editing; Keep, Esc, backdrop; Discard; edit focus; restored values unchanged | `TargetDialog.test.tsx` > leaving without saving (4 tests) | Mostly yes (M11). The "focus on Keep editing" assertion passes without `initialFocus` (M18 survived): see N2 | Met |
| 33 | Removal focus: next row's Edit, Add target for the last, empty state's Add target; Add and Edit disabled during removal | `AlertList.test.tsx` > removing a target | yes (M27, M32) | Met |
| 34 | Changed tests are replaced only as the task lists | diff of `AlertList.test.tsx` (removed lines: the four named criteria and the three focus assertions) | n/a | Met |
| 35 | Repo-wide: `make check`; nothing outside allowed paths; manifests unchanged; existing `Dialog.test.tsx` unchanged | `make check`; `git diff main...HEAD --name-only`; no removed lines in `Dialog.test.tsx` | n/a | Met |

## Plan check (`target-form-dialog.plan.md`, read after the criteria)

- Every acceptance criterion has a ticked item. Nothing is missing from the plan.
- Every ticked test exists. Two items are weaker than the tick suggests: the blank-address check (N1) and the Keep editing focus (N2).
- Plan against diff:
  - The plan says "The diff has no unrelated formatting changes". `hooks/useRemoveTarget.ts` has them: three `toast.show` calls and one `refetchQueries` call were expanded to multi-line with no change in meaning (cosmetic, N5).
  - The plan lists the opening-while-removal-question test under `AlertList.test.tsx` in the checklist and under `TargetDialog.test.tsx` in its notes; it is in `TargetDialog.test.tsx`.
  - The diff adds `lib/targetForm.ts` (+ test) and `components/FieldErrorText.tsx`, which the task's Structure list does not name (the builder's choice of name); the plan's checklist does not mention them. They are small and tested, and no rule forbids them.
  - Judgment calls in the plan (hidden default submit button, `dismiss()`, outcome-based focus, `failure` derived from the mutation) match the code.
  - The plan says `make check` gave 520 tests; reproduced.

## Rule checks

- **Dependencies:** `package.json` and `package-lock.json` unchanged; the only new import path is `@base-ui/react/radio` and `radio-group`, in the one wrapper the task names. Lucide icons used (`Plus`, `Pencil`, `X`, `Mail`, `Webhook`, `Trash2`, `TriangleAlert`, `CircleAlert`, `LoaderCircle`, `RefreshCw`, plus `WifiOff`, already used by the screen's banners) exist in the installed version. No pinned version changed.
- **Ownership:** only `frontend/src/**` and the plan file changed.
- **`useSaveTarget.ts`:** `cancelQueries`, then `setQueryData` on `targetsQueryKey(serviceId)` with `updatedAt: entry.dataUpdatedAt`; no refetch on success; cache change and toast are in the mutation's `onSuccess`, not in a `mutate` callback; failures are chosen by `ApiError.status` and `code`; a 401 yields `null`; the failure is derived with `useMemo`, not copied into state.
- **Form:** react-hook-form with `useFieldArray`; the only client check is "the active contact is filled"; `toInput` leaves out the other type's fields; `name` is sent as typed; the only limit is `NAME_MAX_LENGTH` (`maxLength` and counter); no `dangerouslySetInnerHTML` anywhere in `src`; user text is rendered as React children.
- **Components:** only `RadioGroup.tsx` imports Base UI's radio; `Dialog.tsx` gained exactly `showClose`, `sheet`, `finalFocus` and still portals to `getPortalHost()`; nothing in `features/alert-list` imports `service-form` or `service-list`; `HeaderRows.tsx` has no target text; no literal colour in the new CSS (the `18px` and `6px` are copied from `service-form.css` and the design CSS).
- **CONVENTIONS.md:** the one `eslint-disable` is `react-hooks/exhaustive-deps` with a comment, the exception the file allows. Hooks are one per concern with colocated tests. Server data is not copied into state (the `target` snapshot in `useTargetDialog` is the edit buffer the task asks for). Hand-written replacements: none (dialog, radio group, toast are wrappers).
- **Wording:** each dialog-specific string is defined once (`TargetDialogBanners.tsx`, `TargetDialog.tsx` constants, `targetFields.ts`) with the curly apostrophes and `…` as written.
- **Keyboard:** Name has focus on open; order is Name, Type, contact, headers, footer; Add header and Remove header are buttons; the summary has `tabindex="-1"`; errors are linked by `aria-describedby`.
- **Layout, by reading CSS:** `.dialog-layer--sheet`, `.dialog--sheet` and `.kv__label { display: block }` are in the `@container app (max-width: 640px)` block; `.kv__label` is `display: none` otherwise; `overflow-wrap: anywhere` is on the dialog title, `.plain-text` and the target rows.
- **Contract:** the body is `EmailTargetInput` or `WebhookTargetInput`; statuses handled match both operations plus "anything else"; `alert_list_full` is handled only for the create.
- **Design reference:** values copied into the project's CSS, no board markup or component code copied.

## Mutation checks run

Each change was made in source, the named tests were run, and the file was restored with `git checkout`. "Failed" means the named test failed as intended.

| # | Mutation | Result |
|---|---|---|
| M1 | remove `cancelQueries` | failed: "cancels a list request in flight..." |
| M2 | drop `updatedAt` from `setQueryData` | failed: "201 appends the returned target last..." |
| M3 | allow `alert_list_full` on an edit | failed (hook and dialog tests) |
| M4 | warning check made case sensitive | failed: `HTTP://x` after two spaces |
| M5 | webhook body also sends `address` | failed (4 tests) |
| M6 | `name` trimmed before sending | failed: "sends an email as { type, name, address }" |
| M7 | `clearHeaders` leaves row errors | failed: "clearHeaders removes the bare entry and every headers[…]..." |
| M8 | name limit 51 | failed (limit test, open-dialog tests) |
| M9 | duplicate message always for email | failed: "409 target_duplicate on an add of webhook..." |
| M10 | 401 treated as unexpected | failed: "401" |
| M11 | leave guard ignores `saving` | failed: "does nothing while saving" |
| M12 | Close ignores `busy` | failed: Dialog `showClose` test |
| M13 | warning regex without leading-space allowance | failed: `HTTP://x` after two spaces |
| M14 | toast always `Target saved.` | failed (several) |
| M15 | an edit appends instead of replacing | failed (hook and dialog) |
| M16 | wrong focus after removing the only header row | failed (HeaderRows and dialog) |
| M17 | `beforeunload` always armed | failed |
| M18 | remove `initialFocus` from the discard dialog | **survived** (N2) |
| M19 | client check without `trim()` | **survived** (N1) |
| M20 | duplicate message not cleared on edit | failed (email and webhook) |
| M21 | remove `tabIndex={-1}` on the summary | failed |
| M22 | inputs not read-only while saving | failed |
| M23 | remove the in-flight guard in `useSaveTarget` | failed (hook test and the verifier's same-tick test) |
| M24 | remove `if (saving) return` in `onSubmit` | survived: redundant with M23's guard (not a gap) |
| M25 | drop `dialog--sheet` | failed |
| M26 | opening does not dismiss the removal question | failed (add and edit) |
| M27 | `Add target` not disabled during removal | failed |
| M28 | `alert_list_full` treated as unexpected | failed |
| M29 | `clearFailure()` removed from `onSubmit` | survived the builder's tests; killed by the row the verifier added |
| M30 | a 404 on add keeps the dialog open | failed (2 tests) |
| M31 | Reload does nothing | failed |
| M32 | focus after removal goes to Remove | failed (3 tests) |
| M33 | `added` focus ignores the opener | failed |

## Tests added by the verifier

All in `frontend/src/features/alert-list/components/TargetDialog.test.tsx`, in a new `describe('limits and odd input')`:

- a pasted name of 50 and of 51 characters keeps 50 and the counter agrees (it.each; the sent body has the kept name);
- a 2,049-character URL and an address with inner spaces are sent as typed;
- two submits in the same tick send one request (kills M23 at dialog level);
- 409 `target_duplicate` on an edit of a webhook shows the URL message and focuses the URL field;
- a submit that fails the client check drops the previous failure banner (kills M29).

Result: all pass; ESLint passes on the file; the whole frontend suite passes (525 tests).

## Cases tried that the task file does not list

- Name of 50 and 51 pasted: truncated by `maxlength` to 50, counter `50/50`.
- 2,049-character URL: no client refusal, sent as typed (the task says the server refuses).
- Address with inner spaces: sent as typed. Leading or trailing spaces cannot reach the code: `type="email"` and `type="url"` inputs strip them (see N1).
- 21 header rows: no limit (the builder's test goes to 21; the verifier did not repeat it).
- Two submits in the same tick: one request.
- A 422 on `url`, then switching to Email: the summary keeps `Webhook URL: Not a URL.` as a link to an input that no longer exists (N3).
- A header value with CR or LF: not reachable by typing into a text input; the value is sent as typed per the task, and the server's rules decide.
- A list that fills in another tab, a target deleted in another tab, and a session that ends during a save: covered by the task's own criteria and their tests (M28, M30, M10).
- Same webhook URL as an email contact, and 409 handling by message text: the screen never reads message text (checked in `toFailure`); the server decides what a duplicate is.
- Not tried: a live run of the built binary. The behavior was exercised in jsdom only; layout (sheet at 640 px, wrapping) was checked by reading the CSS.

## Integration tests

Not run: the task changes only `frontend/src/`; no Go code with integration tests is touched, and no criterion depends on one. `make test-integration` exists for Go tests tagged `integration` (mailer against Mailpit); none relate to this task. No database version was printed because the command was not started.

## Findings

### Blocking

None.

### Non-blocking

- **N1. Test quality: the "blank address or URL" case is never exercised.** The test types `'   '` into `<input type="email">` and `<input type="url">`; jsdom (and browsers) strip leading and trailing whitespace from those input types, so the value is `''` and M19 (removing `trim()`) survived. `filled()` in `TargetDialog.tsx` also cannot see a blank value in a real browser. *Matters when:* the inputs change to `type="text"`, at which point a whitespace-only address would be sent to the server unless `trim()` stays. Not a bug today.
- **N2. Test quality: the Keep editing focus assertion passes without `initialFocus={keepRef}`** (M18). Keep editing is the first tabbable element of the question, so the library's default lands there too. *Matters when:* a control is added before Keep editing in `TargetDiscardDialog.tsx`.
- **N3. UX: a 422 summary keeps entries for the inactive type.** After switching Email and Webhook, the summary can list `Webhook URL: …` with a link that moves focus nowhere. Its message is hidden with the field. *Matters when:* an admin gets a `url` error and then switches to Email. Decision needed: whether to drop the other type's entries on a type switch; the task file only lists "switching type after a 422" under inputs to try.
- **N4. Latent bug (report only): the name limit counts UTF-16 units** (`maxLength` and `name.length`). Characters outside the BMP (most emoji) count as two, so a name of 26 emoji is refused by the input although the contract counts characters. No trigger beyond a deployment where admins use emoji names; the 50 is the board's.
- **N5. Cosmetic: unrelated reformatting in `hooks/useRemoveTarget.ts`** (four calls expanded onto several lines), against the plan's statement. *Matters when:* the file is next blamed or merged with another branch that edits those lines.
- **N6. Cosmetic: `docs/tasks/target-form-dialog.plan.md` fails `make lint-md`** (MD022, MD032 and MD012 around its headings and lists; `lint-md` is not part of `make check`). *Matters when:* a CI step or a hand run of `make lint-md` covers the plan file.
- **N7. Test quality: `if (saving) return` in `TargetDialog.onSubmit` is redundant** with the guard in `useSaveTarget` (M24 survived). Harmless; report only.

## Docs or specs that no longer match

- **Versions adopted:** none new. `@base-ui/react` 1.9.0 (now also its radio and radio-group parts), `react-hook-form`, `@tanstack/react-query` 5.107.1 and `lucide-react` 1.73.0 were already installed; `STACK.md` needs no new entry. If the user wants the radio group's use noted, "Component primitives" can mention it; it names no parts today.
- **`docs/design/README.md`, "Additions that are built":** it lists the discard dialog and the `422` summary. The dialog also has things the board does not draw and the task file decided: the `Close` icon button in the head, the `Try again` and `Reload` banner buttons, the client messages `Enter an email address.` and `Enter a URL that starts with http:// or https://.`, the toasts `Target added.` and `Target saved.`, and the `Something went wrong.` and `The request wasn’t accepted.` banners in the dialog. Decision needed whether to list them.
- **`docs/tasks/backlog.md`:** the row `FR-107, FR-108 | testTarget | Target form` stays (the dialog has no test row). The two "Left out of `target-form-dialog`" notes stay open (shared discard dialog, summary and banners; shared header rows). `alert-list-screen`'s "No Add target, no Edit" known gap is closed by this merge.
- **`docs/openapi.yaml`, `docs/requirements.md`:** no change needed; the implementation matches both.
