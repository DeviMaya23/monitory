# Task: create-service API

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

The admin can add a service through the API: `createService` becomes real. The whole request shape is validated, every field is saved (HTTP and TCP checks, query parameters, headers, body, JSON rules, certificate options, timing settings, alert and public-view flags), the service and its state row are written together, and the answer is the saved service as `not_yet_checked`. Nothing checks the service yet: the usecase calls a scheduler seam after the save, and a do-nothing scheduler is wired until the scheduler task replaces it. After this task a client can add a service and a later task can list it.

Requirements covered, each in the part that saving a service covers:

- FR-6: a service can be added; the answer is the saved service.
- FR-12 and FR-74: a request with invalid settings is rejected and nothing is saved, for every case FR-74 lists.
- FR-20: `alerts_enabled` defaults to true and is saved.
- FR-27 and FR-68: `shown_on_public_view` defaults to false and is saved. The dashboard switch and the service toggle are later tasks.
- FR-33: the type (`http` or `tcp`) and its fields are saved.
- FR-34, FR-50, FR-64: `certificate_check` and `ignore_certificate_errors` are validated and saved. Performing the checks is not built here.
- FR-35, FR-36, FR-37: the request (any of the nine methods, URL, query parameters, headers, body type and body) is saved.
- FR-38: every limit of a saved request, from the configuration.
- FR-41, FR-51, FR-53, FR-57: the timeout, retry count, retry interval and check interval are defaulted, limited and saved.
- FR-44, FR-47, FR-69: JSON rules and the any-or-all mode are validated and saved, at most the configured number of rules. Evaluating them (FR-45, FR-46) is not built here.
- FR-56: the worst-case check time against the check interval.
- FR-59: name required, length limit, unique ignoring case.
- FR-60: the service limit, under concurrent requests.
- FR-65: the two messages, up to 500 characters.
- FR-67: in part. The seam exists and is called after the save; the check itself comes with the scheduler.
- NFR-8: already enforced by the policy router; a test shows `createService` is behind it.

Out of scope:

- Running a check, the scheduler, retries and status transitions (FR-10, FR-51 to FR-55, FR-67 beyond the seam, NFR-6). The scheduler task. This task wires `worker.NoopScheduler`, so a new service stays `not_yet_checked`.
- `listServices`, `getService`, `updateService`, `deleteService`, `pauseService`, `resumeService`, `testServiceCheck`. Other tasks. The 501 stubs for them stay.
- FR-39 and FR-40 (showing saved header values; the public view hiding the request): they belong to `getService` and the public dashboard.
- FR-45 and FR-46 (how a rule is matched against a response) and FR-58, FR-61, FR-64 behavior at check time. Probe and scheduler tasks, milestone 3.
- The 1 MB request limit and the JSON content type. The policy router already applies them (`handler/router.go`, tests in `router_test.go`); this task only proves `createService` sits behind them.
- Everything under `frontend/`. The add-service screen is a later task (a backlog row).
- Notification targets and alert text. Milestone 2.

## Prerequisite

- `sign-in-api` is merged (it is): a session and a CSRF token exist, so the gate lets a request reach `createService`.
- The user has approved `github.com/google/uuid` v1.6.0 by approving this task (see "Dependencies"). It is not named in `STACK.md`; after the merge the user adds it there.

## Role and ownership

Role: Backend.

You may change `backend/**`, except the paths below. You may not change `backend/migration/**` (the `services` and `service_states` tables already exist; no migration is needed), `backend/internal/api/**` (generated), `backend/internal/adaptor/probe/**`, `backend/internal/testutil/target_server.go` and `backend/internal/testutil/target_server_test.go`, `backend/internal/domain/check.go` (those belong to `http-probe`), `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/create-service-api.plan.md`), `.env.example`, the `Makefile` or anything outside `backend/`. No configuration key is added or changed.

Shared files this task touches, all owned by this task while it runs:

- `backend/cmd/server/main.go` (wiring)
- `backend/internal/handler/server.go` (the `Server` fields and `NewServer`)
- `backend/internal/handler/problem.go` (the error mapping)
- `backend/internal/handler/helpers_test.go` (the shared test router)
- `backend/internal/domain/errors.go`, `backend/internal/domain/validation.go`, `backend/internal/domain/limits.go`
- `backend/internal/usecase/fakes_test.go`
- `backend/go.mod`, `backend/go.sum`

Tasks that may run at the same time: `http-probe` (backend; it changes only `adaptor/probe/`, two new files in `testutil/` and `domain/check.go`, none of which this task touches) and `dashboard-screen` (frontend only). No other backend task runs beside this one; `list-and-delete-services-api` waits for this one to merge.

## Operations used

From `docs/openapi.yaml`. `createService` is a 501 stub in `backend/internal/handler/stubs.go` today. Types come from the generated package `backend/internal/api`, never hand-written; only `handler/` imports it.

| Operation | Method and path | Access | Responses this task produces |
|---|---|---|---|
| `createService` | `POST /api/services` | gated, needs `X-CSRF-Token` | 201 `Service`; 400 `malformed_request`; 401 `unauthenticated`; 403 `csrf_failed`; 409 `service_name_taken` or `service_limit_reached`; 413 `payload_too_large`; 415 `unsupported_media_type`; 422 `validation_failed`; 500 `internal_error` |

The 201 lists no `Location` header; do not add one. Of these, 401, 403, 413, 415 and the 400 for a missing body come from the policy router; the 400 for a body that is not valid JSON or does not fit the contract's shape comes from the generated handler (as for `signIn`) or from this task's decoding of `check`; 201, 409, 422 and 500 come from this task's code.

## Behavior

### What exists

- `handler.NewRouter` applies, in this order and before any handler: the size limit (413), the gate (401), CSRF (403), the JSON content type (415) and a required body (400).
- `domain.Service` and `domain.ServiceState` mirror the tables, with every column. `domain.ServiceNameKey` gives `name_key`. `domain.NameValue`, `domain.JSONRule` (its `FailingValue` is a string or a bool), the check, body and rule-mode constants exist. `domain.ValidationError` and `domain.FieldError` exist; `domain.FieldErrorCode` has only `required`.
- `handler/problem.go` already maps `domain.ValidationError` to `422 validation_failed` with `errors`.
- `config.Limits` holds every limit this task needs: `CheckInterval`, `Timeout`, `RetryCount`, `RetryInterval` (each a `Range` with `Default`, `Min`, `Max`), `ServiceNameMaxLength`, `MaxServices`, `MaxJSONRules`, `RequestURLMaxLength`, `RequestMaxQueryParams`, `RequestMaxHeaders`, `HeaderNameMaxLength`, `HeaderValueMaxLength`, `RequestBodyMaxBytes`. No new key.
- The database opens with `_txlock=immediate` and gorm's `TranslateError`, so a write transaction takes the write lock when it begins and a unique-constraint failure surfaces as `gorm.ErrDuplicatedKey`.
- `usecase.Clock` and `pkg/clock` exist.

### The request

Router checks first, as above. The generated binder then decodes the body as `ServiceInput`. A body that is not valid JSON, that is a JSON list, string, number or boolean instead of an object, or in which a field has the wrong JSON type (`name: 5`, `alerts_enabled: "yes"`, `settings.timeout_seconds: "10"`), is `400 malformed_request`. So is a number that Go's decoder cannot read into an integer field (`1.5`, `80.0`, `99999999999999999999`); an integer that decodes but is out of range (`port: 70000`) is a validation error. The body `null` (the whole body) decodes as an empty input and gets the validation errors for `name` and `check.type` (422, not 400). A JSON `null` for any optional field is the same as leaving it out. Unknown properties are ignored.

`check` is a union that the generated code leaves undecoded. The handler decodes it, and maps it to the domain input (see "Structure"):

- `check` missing or `null`, or without a `type`: the domain input has an empty type, and validation answers `check.type` `required`. A missing `check` leaves the generated union empty, and its discriminator then returns a decoding error; that case, and the JSON `null`, mean an empty type, not a 400. Only a `check` that is present and not an object, or whose `type` is present and not a string, is 400.
- `type` is `http`: decoded as an HTTP check. `type` is `tcp`: decoded as a TCP check. Any other `type` value: passed on as is and validation answers `check.type` `invalid_value`.
- A `check` that is not a JSON object (`[]`, `"http"`, `5`), whose `type` is not a string (`{"type":5}`), or whose JSON does not fit the shape of its type (`url: 5`, `headers: {}`, a header whose `name` is a number, `port: "80"`, `certificate_check: true`) is `400 malformed_request`, the same as any other body that does not fit the contract's shape.
- The generated types read a missing or `null` string as the empty string, and the validation rules treat empty and absent alike. So `url: null`, a missing `method`, a header or query parameter with no `name` or `name: null`, are validation errors (422 `required`), not 400; `body: {}` has the empty body type, which means `none`; `certificate_check: {}` means disabled; a header with no `value` has an empty value, which is allowed.
- Properties of the other type (`host` on an HTTP check, `url` on a TCP check) are ignored and not saved.
- A rule's `failing_value` that is a string or a boolean is kept. Missing or `null` is passed on as absent and validation answers `required` on it. Any other JSON type (number, list, object) is `400 malformed_request`.

### Validation

The usecase validates the whole input, collects every field error, and only then writes once (CONVENTIONS rule 7). One field gets at most one error: the first rule that fails, in the order listed. A rejection returns `domain.ValidationError` and nothing is saved, no scheduler call is made. Errors come out in this order: `name`; then the `check.*` fields in the order of the list below; then `settings.*`; then `settings`; then `unhealthy_message`; then `recovery_message`. Inside a list the rows go in order.

Every limit below comes from the configuration, passed in; none is a literal in code except the message limit (500, `domain.MessageMaxLength`). "Characters" are Unicode code points (`utf8.RuneCountInString`); the body limit is bytes. Before anything else is checked, surrounding whitespace (`strings.TrimSpace`) is removed from the fields that name or locate something: `name`, `check.url`, `check.host`, the `name` of each query parameter and header, the `value` of each header, and each JSON rule `field`. Lengths are counted after trimming, and what is saved is the trimmed text. The two messages are trimmed too (see below). Everything else is kept as typed: query parameter values, the body content, a rule's `failing_value`, `check.method`, `check.type`. A value at its limit passes and one past it is rejected. A value at its limit passes and one past it is rejected.

**name**

1. Empty after trimming (so also only whitespace): `required`.
2. More than `ServiceNameMaxLength` characters: `too_long`.

The name is saved trimmed, with its inner letter case kept. Uniqueness is decided by `domain.ServiceNameKey(name)` in the repository (see "Saving").

**check, any type**

1. `check.type` empty or absent: `required`. Not `http` or `tcp`: `invalid_value`. If it fails, no other `check.*` field is validated.

**check, type `http`**, in this order:

1. `check.method`: empty or absent: `required`. Not one of `GET`, `HEAD`, `POST`, `PUT`, `DELETE`, `CONNECT`, `OPTIONS`, `TRACE`, `PATCH` (exact, upper case): `invalid_value`.
2. `check.url`: empty or absent: `required`. Not starting with `http://` or `https://` (the letters of the scheme in any case; nothing after the scheme is checked): `invalid_format`. Longer than `RequestURLMaxLength` characters, where the length is that of the URL plus, for each query parameter, 1 (the `?` or `&`) + the characters of its name + 1 (the `=`) + the characters of its value, all unencoded: `too_long`.
3. `check.query_params`: more than `RequestMaxQueryParams` rows: `too_many` on `check.query_params`. For each row: empty `name`: `required` on `check.query_params[i].name`. A query parameter's name and value have no length limit of their own.
4. `check.headers`: more than `RequestMaxHeaders` rows: `too_many` on `check.headers`. For each row: `name` empty: `required`, longer than `HeaderNameMaxLength` characters: `too_long`, on `check.headers[i].name`; `value` longer than `HeaderValueMaxLength` characters: `too_long` on `check.headers[i].value`. An empty value is allowed.
5. `check.body.type`: absent or empty means `none`. Not `none`, `json`, `text` or `form`: `invalid_value`. `check.body.content`: more than `RequestBodyMaxBytes` bytes: `too_long`, whatever the type (FR-38: a value over a limit is rejected). The content is not parsed (a `json` body is sent as typed). With type `none` the content, within the limit, is not saved: the row holds an empty string.
6. `check.json_rules`: more than `MaxJSONRules` rows: `too_many` on `check.json_rules`. For each row: empty `field`: `required` on `check.json_rules[i].field`; absent `failing_value`: `required` on `check.json_rules[i].failing_value`.
7. `check.json_rule_mode`: absent means `any`. Not `any` or `all`: `invalid_value`.
8. `check.certificate_check.enabled` true and the URL does not start with `https://` (a URL that is empty or failed rule 2 counts as not https): `requires_https_url` on `check.certificate_check.enabled`. With `enabled` true, `min_days_left` absent: `required`; below 1: `out_of_range`, on `check.certificate_check.min_days_left`. With `enabled` false or absent the minimum is ignored and saved as null.
9. `check.ignore_certificate_errors` true and the URL does not start with `https://` (same rule): `requires_https_url` on `check.ignore_certificate_errors`.

**check, type `tcp`**, in this order:

1. `check.host`: empty or absent: `required`. Nothing else about a host is checked.
2. `check.port`: below 1 or above 65535, an absent port included (it reads as 0): `out_of_range`.

**settings**, for both types. Each of the four is optional; absent means the configured default. In this order: `settings.check_interval_seconds`, `settings.timeout_seconds`, `settings.retry_count`, `settings.retry_interval_seconds`: outside the configured `Min` to `Max` (inclusive): `out_of_range`. Then, only when all four values in force are in range: if timeout × (1 + retry count) + retry interval × retry count is greater than the check interval, `check_budget_exceeded` on `settings`. Equal to the interval passes.

**alerts and public view.** `alerts_enabled` absent: true. `shown_on_public_view` absent: false.

**messages.** `unhealthy_message` and `recovery_message`: absent or `null` is empty. Surrounding whitespace (`strings.TrimSpace`) is removed first; the trimmed text longer than 500 characters is `too_long`. The trimmed text is saved; empty means the default message (applied later, never copied into the row).

### Field error wording

The message is shown on the field as it is. `{N}` and the other braces are the configured values in force, as plain numbers. Wording follows the validation table in `docs/design/service-form.html`, with the limit added where the contract asks for it (`FieldError.message`).

| `field` | `code` | `message` |
|---|---|---|
| `name` | `required` | `Enter a name.` |
| `name` | `too_long` | `Use {ServiceNameMaxLength} characters or fewer.` |
| `check.type` | `required` | `Choose a type.` |
| `check.type` | `invalid_value` | `Not an allowed value.` |
| `check.method` | `required` | `Choose a method.` |
| `check.method` | `invalid_value` | `Not an allowed value.` |
| `check.url` | `required` | `Enter a URL.` |
| `check.url` | `invalid_format` | `Enter a URL that starts with http:// or https://.` |
| `check.url` | `too_long` | `Use {RequestURLMaxLength} characters or fewer, query parameters included.` |
| `check.query_params` | `too_many` | `Too many rows. Use {RequestMaxQueryParams} or fewer.` |
| `check.query_params[i].name` | `required` | `Required.` |
| `check.headers` | `too_many` | `Too many rows. Use {RequestMaxHeaders} or fewer.` |
| `check.headers[i].name` | `required` | `Required.` |
| `check.headers[i].name` | `too_long` | `Use {HeaderNameMaxLength} characters or fewer.` |
| `check.headers[i].value` | `too_long` | `Use {HeaderValueMaxLength} characters or fewer.` |
| `check.body.type` | `invalid_value` | `Not an allowed value.` |
| `check.body.content` | `too_long` | `Use {RequestBodyMaxBytes} bytes or fewer.` |
| `check.json_rules` | `too_many` | `Too many rows. Use {MaxJSONRules} or fewer.` |
| `check.json_rules[i].field` | `required` | `Required.` |
| `check.json_rules[i].failing_value` | `required` | `Required.` |
| `check.json_rule_mode` | `invalid_value` | `Not an allowed value.` |
| `check.certificate_check.enabled` | `requires_https_url` | `Needs a URL that starts with https://.` |
| `check.certificate_check.min_days_left` | `required` | `Enter a number of days.` |
| `check.certificate_check.min_days_left` | `out_of_range` | `Must be 1 or more.` |
| `check.ignore_certificate_errors` | `requires_https_url` | `Needs a URL that starts with https://.` |
| `check.host` | `required` | `Enter a host.` |
| `check.port` | `out_of_range` | `Must be between 1 and 65535.` |
| `settings.check_interval_seconds` | `out_of_range` | `The check interval is {Min} to {Max} seconds.` |
| `settings.timeout_seconds` | `out_of_range` | `The timeout is {Min} to {Max} seconds.` |
| `settings.retry_count` | `out_of_range` | `The retry count is {Min} to {Max}.` |
| `settings.retry_interval_seconds` | `out_of_range` | `The retry interval is {Min} to {Max} seconds.` |
| `settings` | `check_budget_exceeded` | `The longest attempt takes {W} seconds, longer than the check interval of {I} seconds. Raise the interval, or lower the timeout, retries or retry interval.` |
| `unhealthy_message` | `too_long` | `Use 500 characters or fewer.` |
| `recovery_message` | `too_long` | `Use 500 characters or fewer.` |

`{Min}` and `{Max}` are that setting's configured limits; `{W}` is the worst-case time, timeout × (1 + retry count) + retry interval × retry count, and `{I}` the check interval, both of the values in force. `[i]` is the zero-based row index.

### Saving

The usecase builds a `domain.Service` from the validated input and then asks the repository to save it. What is built:

- `ID`: a new UUIDv7 as 36-character text (`domain.NewID`, see "Structure").
- `Name` trimmed; `NameKey` = `domain.ServiceNameKey(Name)`.
- `CheckType`, and the type's own columns; the other type's columns are nil or their defaults (`[]`, `none`, empty, `any`, false) whatever else was sent. List columns keep the order the admin gave. A rule's `FailingValue` is a string or a bool.
- The four timing values in force (the configured default where absent), `AlertsEnabled`, `ShownOnPublicView`, the two trimmed messages, `Paused` false.
- `CreatedAt` and `UpdatedAt` both the clock's current time, in UTC.

The repository, in one write transaction: counts the services; if the count is `MaxServices` (the configured limit, passed in) or more, it returns `domain.ErrServiceLimitReached` and writes nothing; otherwise inserts the service and its `service_states` row (`status` `not_yet_checked`, every other column null). When the insert fails with `gorm.ErrDuplicatedKey` (gorm's error translation leaves no constraint name), the repository tells a name clash from any other duplicate by asking, inside the same transaction, whether a service with that `name_key` exists: if it does, it returns `domain.ErrServiceNameTaken`; if not, it returns the database error as it is. The transaction is rolled back either way (no service and no state row). Any other database error is returned as it is. The count comes before the insert, so a request that breaks both rules gets `service_limit_reached`. The name rule is the unique index: the query after a failure only classifies the failure and never decides whether to insert (`docs/data-model.md`: no check-then-insert).

Only after the transaction has committed does the usecase call `Scheduler.Start` with the saved service, once. It is never called inside the transaction, and never when the request was rejected or the save failed. `Start` returns nothing; in this task the wired scheduler does nothing.

### The response

`201` with `Service`, built by the handler from what the usecase returns (a `domain.ServiceView`, see "Structure"):

- `id`; `name` as saved; `paused` false; `target_count` 0; `alert_delivery_failed` false.
- `state`: `status` `not_yet_checked`; `last_checked_at`, `last_status_change_at` and `last_failure_reason` all `null` (present, not omitted).
- `settings`: all four values in force. `alerts_enabled`, `shown_on_public_view`, `unhealthy_message` and `recovery_message` as saved (an empty message is `""`).
- `check`, with every field of its type present, defaults included, and empty lists as `[]` (not omitted): for `http`: `type`, `method`, `url`, `query_params`, `headers`, `body` (`type`, `content`), `json_rules`, `json_rule_mode`, `certificate_check` (`enabled`, and `min_days_left` only when enabled), `ignore_certificate_errors`; for `tcp`: `type`, `host`, `port`.

### Errors

| Error | Where it comes from | Answer |
|---|---|---|
| `domain.ErrServiceNameTaken` (new) | repository | 409, code `service_name_taken`, title `Name already used`, no `detail` |
| `domain.ErrServiceLimitReached` (new) | repository | 409, code `service_limit_reached`, title `Service limit reached`, no `detail` |
| `domain.ValidationError` | usecase | 422 `validation_failed`, title `Validation failed`, with `errors` (already mapped) |
| any other error | anywhere | 500 `internal_error`; the text is logged by the existing error handler and never in the body |

Logging: on success the handler logs one info line, message `service added`, with attributes `service_id` and `service_name` and nothing else. Nothing else in this task logs (the check URL, query parameters, headers and body are never logged).

### Known gaps

- **No first check yet (FR-67).** The scheduler is a do-nothing placeholder until the scheduler task, so a new service stays `not_yet_checked`. The verifier does not flag this. The backlog tracks it.
- **IDs read the wall clock inside the library.** `uuid.NewV7` takes the time itself, not from `pkg/clock`. The ID's embedded time is not a rule-bearing timestamp; do not wrap it further.
- **Names are saved trimmed.** `API` and `API` with a trailing space are the same name, because the usecase trims before saving. The repository does not trim: given a name with a trailing space it saves it as it is. Only the letter case is ignored in the comparison. The data model says "trimmed, otherwise as the admin typed it".
- **A URL is not parsed.** `http://` alone passes validation; the check fails when it runs. A host is not parsed either. A `json` body is not checked for valid JSON. Duplicate header names and duplicate query parameter names are allowed.
- **Saved services are not re-validated** when a limit in the configuration changes (`docs/data-model.md`).

## Structure

By `ARCHITECTURE.md`; follow the settings and sign-in code as the example. Names marked "new" are fixed by this file. Names this file does not give (constructors, unexported helpers, test doubles) are the builder's choice.

**domain/**

- `domain/errors.go`: new `ErrServiceNameTaken` and `ErrServiceLimitReached`.
- `domain/validation.go`: `FieldErrorCode` gains the other codes of the contract: `too_long`, `out_of_range`, `too_many`, `invalid_format`, `invalid_value`, `requires_https_url`, `check_budget_exceeded` (constants named like `FieldErrorRequired`).
- `domain/limits.go`: new `Range` (`Default`, `Min`, `Max`, ints) and `ServiceLimits` with the limits listed under "What exists", built in `main.go` from `cfg.Limits`. `usecase/` and `handler/` never import `platform/config`.
- `domain/id.go` (new file): `NewID() (string, error)`, a UUIDv7 as text, by `github.com/google/uuid`.
- `domain/service_input.go` (new file): `ServiceInput`, what the admin sent, in domain terms and still unvalidated: the name; the check as an HTTP part (`HTTPCheckInput`, new) and a TCP part (`TCPCheckInput`, new) with the type as a plain string; do not use the names `HTTPCheck`, `CheckFailure` or `CheckResult`, which `http-probe` creates in `domain/check.go`; optional values as pointers (the four timings, `alerts_enabled`, `shown_on_public_view`, `certificate_check.min_days_left`) so that "absent" is distinguishable; a rule's failing value as `any` that is nil when absent. Strings the contract types as enums stay plain strings so that validation, not the binder, rejects them.
- `domain/service_view.go` (new file): `ServiceView`, a `Service` with its `ServiceState`, `TargetCount` and `AlertDeliveryFailed`. It is what `createService` returns, and what `listServices` will return; it exists now so the handler's mapping is written once.

**usecase/**

- `usecase/service.go` (new file): `usecase.ServiceService` with a constructor taking the repository, the scheduler, the clock (`usecase.Clock`) and `domain.ServiceLimits`; the method `CreateService(ctx, input domain.ServiceInput) (domain.ServiceView, error)`. It defines, in the same file, the interfaces it depends on: `ServiceRepository` with `Create(ctx, service domain.Service, maxServices int) error`, and `Scheduler` with `Start(service domain.Service)`. Later tasks add methods and may move them to their own files (`ARCHITECTURE.md`, "Interfaces").
- `usecase/service_validation.go` (new file): the validation above as a pure function of the input and the limits, returning the field errors. The message wording lives here.

**repository/**

- `repository/service.go` (new file): `repository.ServiceRepository` on `*gorm.DB`, with `Create` as described, in one `db.WithContext(ctx).Transaction`. A duplicate key counts as a name clash only when a service with that `name_key` exists (see "Saving"); a duplicate id is not one.

**worker/**

- `worker/noop_scheduler.go` (new file): `worker.NoopScheduler`, which satisfies `usecase.Scheduler` and does nothing. The scheduler task deletes it. No test (there is no behavior).

**handler/**

- `handler/server.go`: `handler.ServiceService` (new), an interface with `CreateService(ctx, domain.ServiceInput) (domain.ServiceView, error)`, beside `SettingsService`. `Server` gains it as its own field line and its own `NewServer` argument.
- `handler/services.go` (new file): `CreateService` on `*Server`; `stubs.go` is not edited. The success path logs `service added`.
- `handler/service_mapping.go` (new file): `api` request to `domain.ServiceInput` (including the union decoding and its `400`s), and `domain.ServiceView` to `api.Service`. The second function is shared with the future `listServices`; do not inline it in `services.go`.
- `handler/problem.go`: two rows for the new sentinels, with the titles above.

**cmd/server/main.go:** build `repository.NewServiceRepository(db)`, `worker.NoopScheduler{}`, the `domain.ServiceLimits` from `cfg.Limits`, the `usecase.ServiceService` with `clock.Real{}`, and pass it to `NewServer`. Wiring only; no rule in `main.go`.

## Dependencies

One: `github.com/google/uuid` v1.6.0, for UUIDv7 (`uuid.NewV7`). Resolved at drafting time: `go list -m -versions github.com/google/uuid` lists v1.6.0 as the newest, published 2024-01-23, and it is already in `go.mod` as an indirect requirement. Adopt it with, in `backend/`:

```text
go get github.com/google/uuid@v1.6.0
go mod tidy
```

Then check `git diff go.mod go.sum`: the only changes allowed are that `google/uuid` moves from the indirect block to the direct one (and any `go.sum` lines that follow). The `go` directive and any `toolchain` line must not change; if they did, revert and stop and ask (CONVENTIONS, "Go version and dependencies"). No other dependency is added.

## Acceptance criteria

Every criterion is a test that fails if the behavior is removed. Usecase tests use `clock.Fake` and the fakes in `usecase/fakes_test.go`; validation tests run with non-default configured limits so that a hardcoded limit fails, and each limit is tested at the limit and one past it. No integration test (build tag `integration`) is needed.

**ID (`domain/id_test.go`)**

- `NewID` returns 36 characters in UUID form with version 7 and the RFC 4122 variant, and two calls differ.

**Validation (`usecase/service_validation_test.go`, table-driven)**

- A valid minimal HTTP input (name, `GET`, `https://x`) has no errors; a valid TCP input (host, port) has none (FR-6, FR-33).
- Name: empty, absent and whitespace-only are `required` with the exact message; `ServiceNameMaxLength` characters pass and one more is `too_long` with the exact message; the count is in characters (multi-byte characters at the limit pass); spaces around a name are trimmed before the count and before saving (FR-59).
- `check.type`: absent and empty are `required`; `ftp` is `invalid_value`; either way no other `check.*` error appears in the same result (FR-33).
- Method: each of the nine methods passes; empty is `required`; `get` (lower case) and `FETCH` are `invalid_value` (FR-36).
- URL: empty is `required`; `   ` is `required`; `ftp://x` and `example.com` are `invalid_format`; a URL with spaces around it passes; `HTTP://x` and `https://x` pass; the length limit counts query parameters (a URL one character under the limit plus one parameter that pushes it to the limit passes, one more character is `too_long`), and multi-byte characters count once (FR-38, FR-74).
- Query parameters: the limit passes, one more is `too_many` on `check.query_params`; a row with an empty name is `required` on `check.query_params[1].name` with the right index (FR-38).
- Headers: the row limit; an empty name is `required`; a name at its limit passes and one past is `too_long`; a value at its limit passes and one past is `too_long` on `check.headers[i].value`; an empty value passes (FR-38).
- Body: absent is `none`; `xml` is `invalid_value`; content at the byte limit passes and one byte past is `too_long`, where multi-byte characters count by bytes; over-long content is `too_long` with type `none` as well (FR-37, FR-38).
- JSON rules: the limit (`MaxJSONRules`, set to a non-default) passes and one more is `too_many`; an empty field is `required` on `check.json_rules[i].field`; an absent failing value is `required`; a string and a boolean failing value pass; mode `none` is `invalid_value`; absent mode is `any` (FR-44, FR-47, FR-69, FR-74).
- Certificate options: `enabled` with `http://x` is `requires_https_url` on `check.certificate_check.enabled`; with a URL that failed the scheme rule too; with `https://x` and no minimum it is `required`; minimum 0 is `out_of_range` and 1 passes; `enabled` false with a minimum of 0 is no error and the minimum is dropped; `ignore_certificate_errors` with `http://x` is `requires_https_url`, with `https://x` it passes (FR-34, FR-50, FR-64, FR-74).
- TCP: empty host is `required`; ports 0 (and absent) and 65536 are `out_of_range`, 1 and 65535 pass (FR-74).
- Settings: each of the four absent takes the configured default; each is rejected one below `Min` and one above `Max` with its exact message and passes at both; messages carry the configured, non-default limits (FR-57).
- Budget: a case exactly equal to the interval passes and one second over is `check_budget_exceeded` on `settings` with the exact message and the computed `{W}` and `{I}`; with retry count 0 the retry interval does not count; the budget error is absent when any of the four values is out of range (FR-56).
- Messages: 500 characters pass and 501 are `too_long` for each of the two; spaces around a message are trimmed before the count (500 characters plus spaces passes); absent is empty (FR-65).
- Trimming: a name, URL, host, query parameter name, header name and rule field of only spaces is `required`; header value, each at its limit with spaces around it passes; a header value of only spaces is saved empty, which is allowed; `failing_value` and query values are not trimmed (FR-12, FR-59).
- Several problems at once return all of them, in the order named under "Validation", each field once (FR-12).

**Service usecase (`usecase/service_test.go`)**

- A valid HTTP input returns a `ServiceView` whose service has a UUIDv7 id, the typed name, `NameKey` in lower case, the other check type's columns empty, the defaults from the non-default configured limits, `AlertsEnabled` true, `ShownOnPublicView` false, `Paused` false, `CreatedAt` and `UpdatedAt` equal to the fake clock's time; the state is `not_yet_checked` with no times and no failure; `TargetCount` 0 and `AlertDeliveryFailed` false; the fake repository holds exactly that service (FR-6, FR-20, FR-68).
- A TCP input is saved with host and port and no method or URL (FR-33).
- The saved name, URL, host, query parameter names, header names, header values and rule fields are trimmed; query values and `failing_value` are kept as typed; the caller's input is not changed (FR-59).
- Everything given is saved as given: query parameters, headers and rules in the order sent, body type and content, mode `all`, certificate options, both messages trimmed, `alerts_enabled` false, `shown_on_public_view` true (FR-35, FR-37, FR-44, FR-47).
- The repository receives the configured `MaxServices`.
- The scheduler is called exactly once with the saved service, and after the repository write (the fakes record events in one list and the test asserts their order) (FR-67, seam).
- A rejected input returns the `ValidationError`, the fake repository is empty and the scheduler was not called, compared with a baseline in which the same input, made valid, saves and starts (FR-12).
- `ErrServiceNameTaken` and `ErrServiceLimitReached` from the repository come back unchanged (`require.ErrorIs`) and the scheduler is not called (FR-59, FR-60).

**Repository (`repository/service_test.go`, real SQLite through `testutil.NewDB`)**

- `Create` of an HTTP service with every field set, then a read with the test's own query: every column round-trips, lists in their order, a string and a boolean failing value both survive, the other type's columns are null or default (FR-35, FR-37, FR-44).
- A TCP service round-trips with host and port (FR-33).
- The `service_states` row exists after `Create` with `not_yet_checked` and every other column null.
- Closing the database and opening the same file again (`testutil.CloseDB`, `testutil.OpenDB`) shows the service and its state row (NFR-1).
- A second service whose name differs only in case (`API` after `api`), and one that differs by a Unicode case pair (`É` after `é`), return `ErrServiceNameTaken`; one row remains and no state row without a service. The repository does not trim: a name that differs by a trailing space is accepted there (FR-59). The usecase trims first, so this does not happen through the API.
- With the limit set to 2 and two services saved, a third returns `ErrServiceLimitReached` and nothing is written; a duplicate name at the limit also returns `ErrServiceLimitReached` (FR-60).
- Concurrency: with limit 5 and 4 saved, ten goroutines each create a distinct name; exactly one succeeds, nine get `ErrServiceLimitReached`, and the table holds 5 (FR-60). Ten goroutines creating the same name (different case) leave exactly one row and nine `ErrServiceNameTaken` (FR-59).
- A failure other than those two (a service with an id that already exists and a new name) is returned as an error that is neither sentinel, and nothing is left behind. With the limit lowered below the number of saved services, `Create` returns `ErrServiceLimitReached`.

**Handler (`handler/services_test.go` and `handler/service_mapping_test.go`, with a spy of `handler.ServiceService`; every response passes `testutil.AssertConforms(t, "createService", ...)`)**

- 201 with an HTTP service from the spy: the body has every field listed under "The response", `state` with the three `null`s present, empty lists as `[]`, no `Location` header; and for a TCP service the TCP shape (FR-6).
- The request reaches the spy as the domain input: all fields of an HTTP check including a rule with a string and one with a boolean failing value; a TCP check; optional fields absent give nil pointers; `null` for an optional field is the same as absent (FR-35, FR-44).
- `check` missing, `check` without `type`, and `type` of `ftp` reach the spy as an empty or unknown type (the usecase rejects them); they are not 400.
- `check` of `[]`, `"http"` or `{"type":5}`, and a `check` with `url: 5`, `headers: {}`, `port: "80"`, `port: 1.5`, `port: 99999999999999999999`, a header whose `name` is a number, or a rule whose `failing_value` is a number, is 400 `malformed_request` and the spy is not called; the body `null`, `check` as `{}`, `url: null`, `body: {}` (the spy gets the empty body type), `certificate_check: {}` (disabled), and a header or query parameter with no `name`, reach the spy (the usecase rejects them or saves them as described); a rule with no `failing_value` reaches the spy as absent.
- Properties of the other type (`host` on an HTTP check) do not reach the spy.
- The spy returning `ErrServiceNameTaken` is 409 `service_name_taken` with title `Name already used`; `ErrServiceLimitReached` is 409 `service_limit_reached` with title `Service limit reached`; neither has `errors` or `detail` (FR-59, FR-60).
- A `ValidationError` with several fields is 422 `validation_failed` with each field, code and message in order (FR-12).
- An unexpected error is 500 `internal_error` and its text is not in the body.
- The success path writes one log line `service added` with `service_id` and `service_name` and no other attribute; the log has no URL, header or body text (CONVENTIONS, Logging).
- Binding and gate failures, none of which reaches the spy: no body is 400; `{"name":` is 400; `{"name":5}` is 400; `[]` is 400; `text/plain` is 415; a body one byte over a small configured limit is 413 and exactly at it is not 413; no session is 401; a session without the CSRF token is 403 (FR-38, NFR-8).
- `handler/problem.go` maps both new sentinels (covered above); the existing gate and CSRF tables in `router_test.go` now run against the real `createService` and still pass.

**Repo-wide**

- `make check` passes.
- `git diff go.mod go.sum` shows only the `google/uuid` change described under "Dependencies".
- Nothing outside the allowed paths changed.

Tests this task changes on purpose: `handler/helpers_test.go` is extended for the new `NewServer` argument, and `newRouter` installs a default services spy when a test gives none, as it does for settings and auth, so the gate and CSRF tables keep running against all operations. `TestRouter_UnimplementedOperationAnswers501` uses `GET /api/services` (`listServices`), which stays a stub, and is not changed. No existing assertion is removed or loosened.

## Verifier checks

- **No literal limits, by reading `usecase/service_validation.go`, `usecase/service.go` and `handler/`:** every number in the validation rules comes from `domain.ServiceLimits` except 500 (`domain.MessageMaxLength`), 1 and 65535 for a port and 1 for the minimum days left; `main.go` is the only place that maps `cfg.Limits`.
- **Nothing saved on a rejection:** validation finishes before the repository is called; the repository is called once.
- **One transaction, by reading `repository/service.go`:** the count, the service insert and the state insert are in the same transaction; there is no read-then-insert for the name; the name error is returned only when a service with that `name_key` exists after the insert failed with a duplicate key; a duplicate id is not a name clash.
- **Scheduler call, by reading `usecase/service.go`:** after `Create` returns without error, never earlier, never on an error path.
- **Layering:** no `api` type in `usecase/`, `repository/` or `domain/`; `usecase/` and `handler/` do not import `platform/config`; `repository/` tests do not import `usecase/` or `handler/`.
- **Messages:** every string in the wording table appears exactly once in `usecase/service_validation.go` (or a table there), is built from the configured values, and no other user-facing text was invented.
- **Union decoding:** `check: []`, `check: "http"` and `check: {"type": 5}` are 400, not 500 and not a panic. `check: null`, `check` missing, `check: {}` and `check: {"type":"http","url":null}` are 422 (`check.type` `required` for the first three; `check.method` and `check.url` `required` for the last). The body `null` is 422 on `name` and `check.type`. A header or query parameter with no `name` is 422 `required`; `name: 5` is 400. `port: 1.5` is 400 and `port: 70000` is 422. `body: {}` saves as type `none`.
- **Inputs to try:** a name of exactly the limit in multi-byte characters; the URL at its limit with a parameter; ten concurrent identical creates; a rule whose value is the string `"true"` and one that is the boolean `true` (both saved as different types); `settings: {}` and `settings: null`; a TCP body that also carries `url` and `headers`; `unhealthy_message` that is only spaces.
- **Dependency:** `go.mod` has `google/uuid` v1.6.0 in the direct block, the `go` directive unchanged.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency beyond the one listed, a migration, a configuration key, or an edit to a spec file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.
- The generated types for `CheckConfig` or `JsonRule.FailingValue` cannot give you what "The request" describes (for example, an absent `check` cannot be told from an empty one).
- `go get` changes the `go` directive or adds a toolchain line.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), the dependency version adopted, and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle. The user records `google/uuid` v1.6.0 in `STACK.md` after the merge, and the report's "docs or specs that no longer match" names it.
