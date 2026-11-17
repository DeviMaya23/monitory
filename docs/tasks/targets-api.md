# Task: targets API

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The admin can read, add, edit and remove the notification targets on a service's alert list through the API: `listTargets`, `createTarget`, `updateTarget` and `deleteTarget` become real. After this task a service's alert list can be built and kept, with every limit and the duplicate rule enforced on the server, including when two requests arrive at once. Nothing is sent to a target yet, and no screen uses these operations yet.

Requirements covered:

- FR-14: a target can be added to a service's alert list (`createTarget`).
- FR-15: a target can be edited (`updateTarget`).
- FR-16: a target can be removed (`deleteTarget`).
- FR-17: a service's alert list can be read (`listTargets`).
- FR-18: an alert list belongs to one service; the same contact on two services is accepted on each.
- FR-19: a list holds at most `MAX_TARGETS_PER_SERVICE` targets (5 by default); one more is `409 alert_list_full`, also under concurrent requests.
- FR-80, FR-87: an optional name, up to 50 characters.
- FR-81: a target is an email address or a webhook.
- FR-82: an email address must be validly formatted.
- FR-88: the same contact (same type and value) cannot be in one list twice; an email address ignores case, a URL is compared exactly; also under concurrent requests.
- FR-89: a webhook URL must start with `http://` or `https://`.
- FR-92: a webhook target's custom headers have the limits of a service request's headers.
- FR-110: an email address is up to `EMAIL_MAX_LENGTH` characters, a webhook URL up to `WEBHOOK_URL_MAX_LENGTH`.
- FR-70, in part: deleting a service removes its targets (the existing cascade; one repository assertion).
- FR-86, in part: `listTargets` returns `last_delivery_failed`, and editing a target keeps its value. Nothing sets the value until a later task, so it is false in practice.
- NFR-8: all four operations are behind the policy router's session gate, and the three that send data behind the CSRF check.

Out of scope:

- The alert list screen, the target dialog and the notice shown for an `http://` webhook URL (FR-100: a form behavior; the server accepts the URL). A later frontend task; it is in the backlog.
- `testTarget` (`POST /api/services/{serviceId}/target-tests`, FR-107, FR-108). Its 501 stub stays. Backlog row.
- Sending anything: the mailer, the webhook sender, the delivery loop and the per-target retries (FR-83 to FR-85, FR-90, FR-91, FR-115). Backlog rows.
- Writing `last_delivery_failed`. Only the delivery-outcome usecase will, in a later task. Tests here insert the value directly.
- The default unhealthy and recovery messages and the email subject and body (FR-21 to FR-25). Not decided; they belong to the task that sends alerts.
- `createService`, `updateService`, `listServices` and their counts. `target_count` and `alert_delivery_failed` in `listServices` are already computed from `targets` and do not change.
- A new migration. The `targets` table and its unique index (`service_id`, `type`, `value_key`) exist (migration 000001).
- Everything under `frontend/`.

## Prerequisite

`scheduler` is merged. It owns `backend/cmd/server/main.go`, `backend/internal/usecase/service.go` and `backend/internal/usecase/fakes_test.go` while it runs, and this task changes `main.go` and `fakes_test.go`. The builder checks first that the default branch has `backend/internal/worker/scheduler.go` (`worker.Scheduler`, `worker.NewScheduler`), `ServiceService.StartChecks`, and no `worker/noop_scheduler.go`, and stops to ask if not (it never creates them). `main.go` then builds `worker.NewScheduler(...)`, defers `scheduler.Close()` and calls `services.StartChecks` before the server starts; this task keeps all of that as it is and only adds the target wiring.

Also on the default branch, as of the planning commit: `domain.Target` and `domain.TargetValueKey`, `domain.TargetNameMaxLength` (50), `domain.NameValue`, `domain.NewID`, `domain.ValidationError` and `domain.FieldError`, `config.Limits` with `MaxTargetsPerService`, `EmailMaxLength`, `WebhookURLMaxLength`, `RequestMaxHeaders`, `HeaderNameMaxLength` and `HeaderValueMaxLength`, `usecase.Clock`, and the four stubs in `handler/stubs.go`. No configuration key is added.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/domain/errors.go`, `backend/internal/domain/limits.go`, `backend/internal/domain/target.go`, and a new `backend/internal/domain/target_input.go`
- `backend/internal/usecase/target.go`, `target_test.go`, `target_repository.go`, `target_validation.go`, `target_validation_test.go` (all new)
- `backend/internal/usecase/service_validation.go` and `service_validation_test.go`, only for the header-rule extraction under "Structure"
- `backend/internal/usecase/fakes_test.go` (the fake target repository)
- `backend/internal/repository/target.go`, `target_test.go` (new)
- `backend/internal/handler/targets.go`, `targets_test.go`, `target_mapping.go`, `target_mapping_test.go` (all new)
- `backend/internal/handler/server.go` (the `TargetService` interface, a field and a `NewServer` argument), `handler/problem.go` (two rows), `handler/helpers_test.go` (the double and the `newRouter` option)
- `backend/cmd/server/main.go` (wiring)

You may not change anything else: `backend/migration/**`, `backend/internal/api/**` (generated), `backend/internal/handler/stubs.go` (the methods on `Server` shadow the stubs), `backend/go.mod` and `go.sum`, `backend/internal/platform/**`, `.env.example`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/targets-api.plan.md`), the `Makefile`.

Shared files this task touches, and who owns each: `main.go`, `handler/server.go`, `handler/problem.go`, `handler/helpers_test.go`, `usecase/fakes_test.go` and `usecase/service_validation.go` are shared wiring or test support. No other backend task runs beside this one: `scheduler` is merged first (Prerequisite), and the task that runs at the same time, `delete-service-dialog`, changes `frontend/src/**` only and shares no file.

## Operations used

From `docs/openapi.yaml`. All four are 501 stubs today. Types come from the generated package `backend/internal/api`; only `handler/` imports it.

| Operation | Method and path | Access | Responses this task produces |
|---|---|---|---|
| `listTargets` | `GET /api/services/{serviceId}/targets` | gated | 200 `TargetList`; 401 `unauthenticated`; 404 `not_found`; 500 `internal_error` |
| `createTarget` | `POST /api/services/{serviceId}/targets` | gated, `X-CSRF-Token` | 201 `Target`; 400 `malformed_request`; 401; 403 `csrf_failed`; 404 `not_found`; 409 `alert_list_full` or `target_duplicate`; 413 `payload_too_large`; 415 `unsupported_media_type`; 422 `validation_failed`; 500 |
| `updateTarget` | `PUT /api/services/{serviceId}/targets/{targetId}` | gated, `X-CSRF-Token` | 200 `Target`; 400; 401; 403; 404 `not_found`; 409 `target_duplicate`; 413; 415; 422; 500 |
| `deleteTarget` | `DELETE /api/services/{serviceId}/targets/{targetId}` | gated, `X-CSRF-Token` | 204 with no body; 401; 403; 404 `not_found`; 500 |

`serviceId` and `targetId` are any string. The 400, 401, 403, 413 and 415 answers come from the policy router and the generated decoder, as for the service operations; no handler checks them. `updateTarget` never answers `alert_list_full`: an edit does not change the count. None of the four takes a query parameter. The error bodies are those of `Problem`; a 404 for either id is the same `not_found`, title `Not found`.

## Behavior

### What exists

- `domain.Target`: `ID`, `ServiceID`, `Name` (empty when none), `Type` (`email` or `webhook`), `Value`, `ValueKey`, `Headers []NameValue`, `LastDeliveryFailed`, `CreatedAt`, `UpdatedAt`; table `targets`.
- `domain.TargetValueKey(type, value)`: lower case for email, the value as it is for a webhook.
- The unique index `targets_service_contact` on (`service_id`, `type`, `value_key`) and `ON DELETE CASCADE` from `services`; every connection has `foreign_keys` on and write transactions take the write lock when they begin (`docs/data-model.md`, Conventions).
- `handler/problem.go` maps domain sentinel errors to codes through `domainProblems`, `domain.ErrNotFound` to 404 included, and `domain.ValidationError` to `422 validation_failed` with the field errors.
- The usecase/repository/handler pattern of `create-service-api` and `list-and-delete-services-api`: validation in the usecase before any write; the repository turns constraint errors into sentinel errors; the handler maps api types to domain types and back.

### The input and the saved row

A target input (`domain.TargetInput`, new) holds what the admin sent, still unvalidated: `Type` (a plain string, so that validation rejects an unknown one), `Name`, `Address` (email), `URL` (webhook), `Headers []NameValue` (webhook). Only the part that matches `Type` is used; a header sent with an email target is ignored and not saved.

Normalization, before validating, and what is saved is the trimmed text: surrounding whitespace is removed from the name, the address, the URL, every header name and every header value (`strings.TrimSpace`). Nothing else is changed: an address keeps its case in `value`, and `value_key` is `domain.TargetValueKey` of the trimmed value.

Saved row, from valid input:

- `id`: `domain.NewID()` at creation; unchanged by an edit.
- `service_id`: from the path.
- `name`: the trimmed name, `""` when absent.
- `type`; `value`: the trimmed address or URL; `value_key`.
- `headers`: the trimmed rows in the order sent for a webhook; an empty list (`[]`, never null) for an email target or a webhook with none.
- `last_delivery_failed`: `false` at creation; an edit keeps the stored value, even when the contact changes (`docs/data-model.md`, FR-86).
- `created_at`: the clock's time in UTC at creation, kept by an edit. `updated_at`: the clock's time in UTC at creation and at each edit.

### Validation

`ValidateTargetInput(in, limits) []domain.FieldError` (new, `usecase/target_validation.go`) reads nothing but its arguments, normalizes first, returns every field error in the order below, and gives one field at most one error. A rejected request saves nothing. Limits are in characters (`utf8.RuneCountInString`), as for services, except where noted. Messages are the text the screen shows on the field as it is. The ones the design shows (`docs/design/alerts.html`) use its wording; the rest follow the wording of the service form.

1. `type`: empty is `required`, "Choose a type."; anything but `email` or `webhook` is `invalid_value`, "Not an allowed value.". With a bad type no other field is checked (the shape is unknown).
2. `name`: more than `domain.TargetNameMaxLength` (50) is `too_long`, "Use 50 characters or fewer.". Empty is valid.
3. For `email`, field `address`, the first that applies:
   - empty: `required`, "Enter an email address.";
   - more than `EmailMaxLength`: `too_long`, "Use N characters or fewer." with the configured N;
   - not a valid address: `invalid_format`, "Enter a valid email address.". Valid means `net/mail.ParseAddress` accepts it **and** the parsed `Address` equals the whole trimmed input, which rejects `Name <a@example.com>`, `<a@example.com>`, comments and lists. Accepted: `oncall@example.com`, `Oncall@Example.COM`, `a@b` (no dot is needed: checks and alerts may use internal addresses). Rejected: `oncall`, `@example.com`, `oncall@`, `a b@example.com`, `a@b@c`.
4. For `webhook`, field `url`, the first that applies:
   - empty: `required`, "Enter a URL that starts with http:// or https://.";
   - does not start with `http://` or `https://`, ignoring the case of the letters (the rule `hasScheme` in `service_validation.go` already applies to a service URL): `invalid_format`, the same message. Only the prefix is checked: `http://` alone is accepted, and `ftp://x`, `example.com` and `httpx://a` are not (FR-89);
   - more than `WebhookURLMaxLength`: `too_long`, "Use N characters or fewer.".
5. For `webhook`, field `headers`, with the limits of a service's headers (FR-92, FR-38): more than `RequestMaxHeaders` rows is `too_many` on `headers`, "Too many rows. Use N or fewer."; then for each row `i`: an empty name is `required` on `headers[i].name`, "Enter a header name."; a name over `HeaderNameMaxLength` is `too_long` on `headers[i].name`, "Use N characters or fewer."; a value over `HeaderValueMaxLength` is `too_long` on `headers[i].value`, "Use N characters or fewer.". An empty value is valid. The names are not otherwise checked.

Boundary: a value of exactly the limit is accepted, one character more is rejected, for the name (50), the address, the URL, a header name, a header value and the row count.

The 1 MB request limit and the content type are the router's (413, 415); a body that is not valid JSON, or whose fields have the wrong JSON type (for example `address` a number), is `400 malformed_request`; a `type` that is missing, null or unknown is the field error above (the handler passes an empty type, as `toCheckInput` does).

### listTargets

1. The repository reads the service; none is `domain.ErrNotFound`, answered 404. (Two statements, not a transaction; see "Known gaps".)
2. It answers 200 with a JSON list (never `null`; no targets is `[]`) of the service's targets ordered by `created_at`, then `id` (`docs/data-model.md`); neither the usecase nor the handler sorts.

Each item is an `api.Target`:

- email: `id`, `type` `email`, `name`, `address`, `last_delivery_failed`;
- webhook: `id`, `type` `webhook`, `name`, `url`, `headers` (always present, `[]` when none), `last_delivery_failed`.

`name` is always present, `""` when none was given (the screen shows "Unnamed email" or "Unnamed webhook"). Addresses, URLs and header values are returned in full as saved. The list never holds more than the configured limit; the contract's `maxItems: 5` is a known gap.

### createTarget

Order of checks; the first that fails answers and nothing is saved:

1. Router: session, CSRF, size, content type, JSON.
2. Validation (422). It comes before the service lookup, so a body with errors for a service that does not exist is 422.
3. In one write transaction in the repository: the service must exist (none: `domain.ErrNotFound`, 404); then the count of its targets; at `MAX_TARGETS_PER_SERVICE` or more it returns `domain.ErrAlertListFull` (409, code `alert_list_full`, title "Alert list full"); then the insert; a violation of the unique index returns `domain.ErrTargetDuplicate` (409, code `target_duplicate`, title "Contact already in the list"). The count comes before the insert, so a duplicate sent to a full list is `alert_list_full`.
4. The handler answers `201` with the saved target as `api.Target`, `last_delivery_failed` false.

The count and the insert are one transaction, and write transactions run one at a time, so two concurrent creates at the limit leave exactly the limit (FR-19) and two concurrent creates of the same contact leave one (FR-88). The repository does not check for a duplicate first: the unique index decides, and its error is turned into the sentinel. The only unique constraints on `targets` are the primary key (a fresh `NewID`) and that index, so a `gorm.ErrDuplicatedKey` on insert is `ErrTargetDuplicate` without a follow-up query.

The same contact on another service is accepted (FR-18). Two targets of different types with the same text are different contacts.

### updateTarget

1. Router, then validation (422), as for create.
2. In the repository, in one write transaction: the target is read by `id` **and** `service_id`; none, because the service or the target does not exist or the target belongs to another service, is `domain.ErrNotFound` (404). Then every editable field is replaced: `name`, `type`, `value`, `value_key`, `headers`, `updated_at`. `id`, `service_id`, `created_at` and `last_delivery_failed` are kept. A change of type is allowed (an email target may become a webhook and the reverse); the headers of an email result are `[]`.
3. A violation of the unique index is `domain.ErrTargetDuplicate` (409 `target_duplicate`), and the stored row is unchanged. Saving a target with its own current contact, or only a different case of its own address, is not a duplicate: the index does not conflict with the row itself.
4. The handler answers `200` with the stored row as `api.Target`, `last_delivery_failed` as stored.

There is no count check, so editing a target of a list that is already full works.

### deleteTarget

1. The repository deletes with one `DELETE ... WHERE id = ? AND service_id = ?`. No row deleted (the service or the target does not exist, or the target belongs to another service) is `domain.ErrNotFound`, 404; nothing else changes.
2. The handler answers `204` with no body.

Deleting the same target twice: 204, then 404. Two concurrent deletes of the same target: exactly one 204, the other 404. Removing a target frees its place: with a full list, a delete then a create succeeds.

### Errors

| Error | Where it comes from | Answer |
|---|---|---|
| `domain.ValidationError` | usecase (create, update) | 422 `validation_failed`, the field errors above (already mapped) |
| `domain.ErrNotFound` | repository (all four) | 404 `not_found`, "Not found" (already mapped) |
| `domain.ErrAlertListFull` (new) | repository (create) | 409 `alert_list_full`, title "Alert list full" |
| `domain.ErrTargetDuplicate` (new) | repository (create, update) | 409 `target_duplicate`, title "Contact already in the list" |
| any other error | anywhere | 500 `internal_error`; the text is logged by the existing error handler and never in the body |

Add the two sentinels to `domain/errors.go` and their two rows to `domainProblems`; both codes exist in the contract.

### Logging

On success the handler logs one info line: `target added`, `target updated` or `target deleted`, with `service_id` and `target_id` and nothing else. A webhook URL, its headers, an address and a name can be secret or personal (`CONVENTIONS.md`, Logging): none of them is logged, and no error text built by this task contains one. Nothing else in this task logs.

### Known gaps

- **`maxItems: 5` in the contract.** `TargetList` allows 5 items while `MAX_TARGETS_PER_SERVICE` is configurable above that (floor 1, no ceiling). With a higher limit the list can exceed the contract, as `ServiceList` can for `MAX_SERVICES` (backlog). Not this task's to resolve; it is on the backlog.
- **`listTargets` reads the service and then the targets in two statements.** A service deleted between them gives an empty list, not 404. The window is tiny and harmless; a read inside a write-locking transaction is not worth it.
- **No way to tell a full list from the outside before saving.** The limit is configuration the screen cannot read; the screen learns it from the 409.
- **The email format is `net/mail`'s.** It accepts some addresses a mail server may refuse; the test alert (`testTarget`) is where that shows.
- **An unreachable or unsafe webhook URL is accepted.** FR-89 checks the prefix only; delivery rules come with the sender.
- **`last_delivery_failed` is always false in the running app** until the delivery-outcome usecase exists. The repository tests insert it directly.

## Structure

By `ARCHITECTURE.md`; follow `create-service-api` and `list-and-delete-services-api` as the examples. Names marked "new" are fixed by this file; others are the builder's choice.

- `domain/target_input.go` (new): `domain.TargetInput`. `domain/limits.go`: `domain.TargetLimits` (new type) with `MaxTargets`, `EmailMaxLength`, `WebhookURLMaxLength`, `MaxHeaders`, `HeaderNameMaxLength`, `HeaderValueMaxLength`. `domain/errors.go`: `ErrAlertListFull`, `ErrTargetDuplicate`.
- `usecase/target_repository.go` (new): `usecase.TargetRepository`, in its own file because it has more than two methods: `List(ctx, serviceID) ([]domain.Target, error)`, `Create(ctx, target domain.Target, maxTargets int) error`, `Update(ctx, target domain.Target) (domain.Target, error)` (the edited row as stored), `Delete(ctx, serviceID, targetID string) error`.
- `usecase/target.go` (new): `usecase.TargetService`, built by `NewTargetService(targets TargetRepository, clock Clock, limits domain.TargetLimits)`, with `ListTargets(ctx, serviceID)`, `CreateTarget(ctx, serviceID, input domain.TargetInput)`, `UpdateTarget(ctx, serviceID, targetID, input)` and `DeleteTarget(ctx, serviceID, targetID)`. The usecase validates, builds the row, calls the repository, and passes errors through unchanged. It does not call the scheduler: a target changes nothing about checks.
- `usecase/target_validation.go` (new): `ValidateTargetInput` and its private normalization. The header rows are validated by the rule `validateHeaders` already holds: extract that rule from `service_validation.go` into a helper that takes the field prefix (`check.headers` or `headers`) and the message for an empty name (the service keeps "Required."), and have both callers use it. The service's behavior and messages do not change, and its tests pass unchanged.
- `repository/target.go` (new): `repository.TargetRepository` on `*gorm.DB`. `Create` and `Update` run in `db.Transaction`, as `ServiceRepository.Create` does. It reads and writes `targets` and reads `services` only to know that the service exists.
- `handler/server.go`: `handler.TargetService` (the four methods, in domain types), a `targets` field and a `NewServer` argument, each on its own line. `handler/targets.go` (new): the four methods on `*Server`. `handler/target_mapping.go` (new): the request union to `domain.TargetInput` (decode the `type`, then the matching generated struct, as `toCheckInput` does; a body of the wrong shape is `errMalformedRequest`) and `domain.Target` to `api.Target`. An empty list is an empty list, not nil.
- `handler/helpers_test.go`: a double of `handler.TargetService` and a `targets` field in `routerOptions` passed to `NewServer`; `newRouter` fills it with the double when the option is unset, as it does for settings, services and auth, so that the generic router tests (`TestRouter_CSRF`, the `operations` loops) that now reach the real target handlers do not hit a nil service. The new `NewServer` argument goes right after `services`; its only two callers are `main.go` and `newRouter`. `usecase/fakes_test.go`: a fake `TargetRepository` that keeps rows in memory and applies the same cap and duplicate rules as the sentinels, for the usecase tests; it is built with the set of service ids that exist (a plain list given by the test, not `fakeServices`) and returns `ErrNotFound` for any other.
- In `target_mapping.go`, the response union is built with the generated helpers (`FromEmailTargetInput` / `FromWebhookTargetInput` on `api.Target`, then the `Id` and `LastDeliveryFailed` pointers), as `toAPICheck` does for a check.
- `cmd/server/main.go`: build `domain.TargetLimits` from `cfg.Limits` next to `serviceLimits` (a small function of the same shape), `usecase.NewTargetService(repository.NewTargetRepository(db), clock.Real{}, targetLimits(cfg.Limits))`, and pass it to `handler.NewServer`. `main.go` holds no rule.

## Dependencies

None. `go.mod` and `go.sum` do not change; `net/mail` is the standard library.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Validation tests use non-default configured limits (for example name 50, address 30, URL 40, 3 headers, header name 10, header value 20, and a target limit of 3) and test each limit at the limit and one past it, so a literal in the code fails. Usecase tests use the fakes; repository tests run against a real SQLite file (`testutil.NewDB`); every handler response passes `testutil.AssertConforms` for its operation. No integration test (build tag `integration`) is needed.

**Validation (`usecase/target_validation_test.go`)**

- A valid email target and a valid webhook target (with headers) give no errors (FR-81).
- `type`: empty is `required` on `type` with "Choose a type."; `ftp` is `invalid_value` with "Not an allowed value."; with either, no other field is reported (FR-81).
- `name`: 50 characters pass, 51 are `too_long` on `name` with "Use 50 characters or fewer."; 50 multi-byte characters pass (counted in characters); empty passes (FR-80, FR-87).
- Address: the accepted and rejected examples under "Validation", each in its own row; empty is `required`; exactly `EmailMaxLength` valid characters pass and one more is `too_long`, and a too-long valid address is `too_long`, not `invalid_format`; a leading and trailing space is removed before the check (FR-82, FR-110).
- URL: `http://x`, `https://x`, `HTTPS://x` and `http://` pass; empty is `required`; `ftp://x`, `example.com` and `httpx://a` are `invalid_format`, with "Enter a URL that starts with http:// or https://."; exactly `WebhookURLMaxLength` passes and one more is `too_long` (FR-89, FR-110).
- Headers: exactly the configured row count passes and one more is `too_many` on `headers`; an empty name is `required` on `headers[1].name` with "Enter a header name."; a name and a value at their limit pass and one character more is `too_long` on `headers[i].name` and `headers[i].value`; an empty value passes; several errors come back together, in the order of the list (FR-92).
- A header sent with an email target is ignored.
- The refactored service header rule: the existing `service_validation_test.go` cases pass unchanged (they prove the service paths `check.headers[i]` and messages are intact).

**Usecase (`usecase/target_test.go`)**

- `CreateTarget` with a valid email target and a valid webhook target saves the row with a new id, the service id, the trimmed values, `value_key` (lower case for an email, exact for a URL), `headers` as `[]` for an email, `last_delivery_failed` false, and `created_at` and `updated_at` from the fake clock (FR-14, FR-81, FR-88).
- Invalid input is `domain.ValidationError` with the field errors, and the repository is not called (nothing saved).
- At the limit of 3: a third target is saved; a fourth is `ErrAlertListFull`; a duplicate sent to a full list is `ErrAlertListFull`; after a delete the next create is saved (FR-19).
- The same address with another case, in the same list, is `ErrTargetDuplicate`; the same URL with another case is accepted (FR-88); the same text as an email and as a webhook are two contacts; the same address on another service is accepted (FR-18).
- `UpdateTarget` replaces name, type, value, `value_key` and headers, and keeps the id, `created_at` and `last_delivery_failed` true when it was true; it sets `updated_at` from the clock (FR-15, FR-86).
- `UpdateTarget` to a contact already in the list is `ErrTargetDuplicate` and the row is unchanged; saving the target with its own contact (or another case of its own address) succeeds; editing a target of a full list succeeds; invalid input is a `ValidationError` and nothing is saved.
- `UpdateTarget` and `DeleteTarget` for an unknown service, an unknown target, or a target of another service are `ErrNotFound`; `ListTargets` and `CreateTarget` for an unknown service are `ErrNotFound` (FR-16, FR-17).
- `ListTargets` returns the targets in the order the repository gives, and an empty non-nil list for none.

**Repository (`repository/target_test.go`)**

- `List` returns the service's targets only, ordered by `created_at` then `id` (inserted in a scrambled order, with two rows sharing a `created_at`), with every field, headers in the order sent, and `last_delivery_failed` as inserted; none is an empty non-nil list; an unknown service is `ErrNotFound`; a service with no targets is an empty list, not `ErrNotFound` (FR-17).
- `Create` saves the row as given, for an email and a webhook with headers, and it comes back by `List` unchanged; an unknown service is `ErrNotFound` and writes nothing (FR-14).
- Cap: with a configured limit of 3 and 3 rows, a fourth is `ErrAlertListFull` and the count stays 3; a duplicate of an existing contact sent to that full list is `ErrAlertListFull`, not `ErrTargetDuplicate` (the count comes first); another service is not counted (FR-19).
- Duplicate: the same type and value is `ErrTargetDuplicate`; the same address in another case is a duplicate; the same URL in another case is not; the same contact on another service is not (FR-88, FR-18).
- Concurrency, under `-race`: with 2 rows and a limit of 3, many concurrent `Create` calls of different contacts leave exactly 3 rows, with the rest `ErrAlertListFull`; many concurrent `Create` calls of the same contact leave one row, with the rest `ErrTargetDuplicate` (the cases `TESTING.md` requires).
- `Update` replaces the editable fields and returns the stored row; keeps `id`, `service_id`, `created_at` and `last_delivery_failed` (inserted as true); a change of type works; a target of another service, an unknown target and an unknown service are `ErrNotFound` and change nothing; a contact already in the list is `ErrTargetDuplicate` and the row is unchanged; the target's own contact is not a duplicate (FR-15, FR-86).
- `Delete` removes one row and leaves the others; the same id twice is nil then `ErrNotFound`; a target id with another service's id is `ErrNotFound` and the row stays; concurrent deletes of one id leave one success (FR-16).
- Deleting a service removes its targets (the existing cascade; one assertion that the table is empty afterwards) (FR-70).

**Handler (`handler/targets_test.go`, `handler/target_mapping_test.go`)**

- Each operation, through the router with a session and the CSRF token, answers its success status and body: 200 list (an email and a webhook item, `name` `""` present, `headers` `[]` present, `last_delivery_failed`), 201 for create with the body as above, 200 for update, 204 with no body for delete (FR-14 to FR-17).
- A body with `type` missing, `ftp`, and one of the field errors above answers 422 `validation_failed` with `errors[].field`, `code` and `message` from the usecase's `ValidationError`, for `address`, `url` and `headers[0].name`; a body whose `address` is a number, and a body that is not JSON, answer 400 `malformed_request`; nothing is saved (the double records no call).
- `ErrNotFound` answers 404 `not_found` for each of the four; `ErrAlertListFull` answers 409 `alert_list_full` and `ErrTargetDuplicate` 409 `target_duplicate` for create; `ErrTargetDuplicate` answers 409 for update (FR-19, FR-88).
- The mapping: a webhook with headers and an email target map to `domain.TargetInput` and back to `api.Target` field by field; a missing `name` is `""`; a missing `headers` is none; a header sent with an email target is dropped.
- The success log line has `service_id` and `target_id` and never the address, URL, name or a header (a test captures the log of a request that carries all four).
- The router's existing every-operation tests (`operations`) cover the 401 and the 403 for the four operations; the verifier confirms they include them (NFR-8).

**Repo-wide**

- `make check` passes.
- `git diff go.mod go.sum` is empty.
- Nothing outside the allowed paths changed.

## Verifier checks

- **Layering, by reading:** `usecase/` imports neither `repository/` nor `api/`; `repository/` and `domain/` do not import `api/`; only `handler/` does; `main.go` holds no rule. The usecase does not call the scheduler.
- **No hardcoded limits:** the numbers 5, 50 (apart from `domain.TargetNameMaxLength`), 254, 2048, 20, 128 and 4096 appear in no non-test file of this task; every limit comes from `domain.TargetLimits` or the constant.
- **Caps and duplicates by the database, not a check-then-write:** the count and the insert are in one `db.Transaction`; the duplicate rule is the unique index's error turned into `ErrTargetDuplicate`; no `SELECT` for an existing contact before the insert.
- **A target of another service is never touched:** every read and write of one target filters by `id` and `service_id`. Try `PUT` and `DELETE` with service A's id and service B's target id (404, row unchanged).
- **Nothing secret in the log or in an error:** read the log calls and every `fmt.Errorf` and `errors.New` this task adds; none may contain a name, address, URL or header (`CONVENTIONS.md`, Logging). The generic error handler logs `err.Error()`, so a repository error must not wrap the row.
- **Order of checks:** validation before the service lookup; the cap before the duplicate. Try a full list with a duplicate (409 `alert_list_full`), an invalid body for an unknown service (422), and an edit of a target in a full list (200).
- **Mutation checks to run:** drop the `service_id` filter on delete; compare an email by its exact case (drop the lower-casing of `value_key`); lower-case a URL; move the count after the insert; let `Update` overwrite `last_delivery_failed`; let `Update` change `created_at`; count the cap with `>` instead of `>=`; skip the trim; leave an email target's headers `null`. Each must fail at least one named test.
- **Inputs to try:** 51-character name, 255-character address, 2049-character URL, 21 headers, a 129-character header name, a 4097-character header value, each with the default configuration; `Name <a@example.com>`; a body `{}`; a body of `null`; an address with surrounding spaces; a webhook with an empty header name; two concurrent creates at 4 of 5 targets (one 201, one 409).
- **Existing tests:** no existing test asserts a 501 for a target route (`TestRouter_UnimplementedOperationAnswers501` uses `GET /api/services/a-service`); the stubs stay in `stubs.go`, shadowed.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other, or you need a status code, error code, field or parameter the contract does not list.
- You think you need a change outside your paths, a dependency, a migration, a configuration key, or an edit to a spec file.
- `scheduler` is not merged, or a name under "Prerequisite" is missing.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), that no integration test applies, and anything you were unsure about. Also list every judgment call this file did not settle.
