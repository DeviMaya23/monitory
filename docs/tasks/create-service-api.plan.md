# Plan: create-service API

Branch: `feat/create-service-api`. Paths are under `backend/internal/` unless noted.

## Acceptance criteria

### ID

- [x] `NewID`: 36 chars, version 7, RFC 4122 variant, two calls differ. File `domain/id.go`; test `domain/id_test.go`.

### Validation (`usecase/service_validation.go`; test `usecase/service_validation_test.go`, table-driven, non-default limits)

- [x] Valid minimal HTTP and TCP inputs have no errors (FR-6, FR-33).
- [x] Name: required, limit and one past, characters not bytes (FR-59).
- [x] `check.type`: required, `invalid_value`, no other `check.*` errors (FR-33).
- [x] Method: nine pass, required, invalid (FR-36).
- [x] URL: required, invalid_format, scheme case, length with query params, multi-byte (FR-38, FR-74).
- [x] Query params: limit, too_many, empty name index (FR-38).
- [x] Headers: row limit, name required, name and value limits, empty value ok (FR-38).
- [x] Body: absent is none, invalid type, byte limit, none type too (FR-37, FR-38).
- [x] JSON rules: limit, field required, failing_value required, string and bool, mode (FR-44, FR-47, FR-69, FR-74).
- [x] Certificate options (FR-34, FR-50, FR-64, FR-74).
- [x] TCP host and port (FR-74).
- [x] Settings: defaults, one below Min and above Max, exact messages (FR-57).
- [x] Budget: equal passes, one over fails, retry 0, absent when out of range (FR-56).
- [x] Messages: 500/501, trim, absent (FR-65).
- [x] Several problems at once, in order, each field once (FR-12).

### Service usecase (`usecase/service.go`; test `usecase/service_test.go`, fakes in `usecase/fakes_test.go`)

- [x] Valid HTTP input returns the expected ServiceView and the fake repo holds it (FR-6, FR-20, FR-68).
- [x] TCP input saved (FR-33).
- [x] Everything given is saved as given (FR-35, FR-37, FR-44, FR-47).
- [x] Repository receives configured `MaxServices`.
- [x] Scheduler called exactly once, after the write (FR-67 seam).
- [x] Rejected input: ValidationError, nothing saved, no scheduler call, against a baseline (FR-12).
- [x] Name-taken and limit sentinels returned unchanged, no scheduler call (FR-59, FR-60).

### Repository (`repository/service.go`; test `repository/service_test.go`, real SQLite)

- [x] Full HTTP round trip (FR-35, FR-37, FR-44).
- [x] TCP round trip (FR-33).
- [x] State row created.
- [x] Reopen keeps service and state (NFR-1).
- [x] Case and Unicode-case name clash; trailing space accepted (FR-59).
- [x] Limit 2 reached; duplicate name at limit gives limit error (FR-60).
- [x] Concurrency for limit and for same name (FR-59, FR-60).
- [x] Other failure (duplicate id) is neither sentinel, nothing left; limit lowered below count.

### Handler (`handler/services.go`, `handler/service_mapping.go`; tests `handler/services_test.go`, `handler/service_mapping_test.go`)

- [x] 201 shape for HTTP and TCP, no Location (FR-6).
- [x] Request reaches spy as domain input; null = absent (FR-35, FR-44).
- [x] check missing / without type / ftp reach spy, not 400.
- [x] 400 cases and pass-through cases for check shapes.
- [x] Other-type properties dropped.
- [x] 409 for both sentinels (FR-59, FR-60).
- [x] 422 with several fields (FR-12).
- [x] 500 with no internal text.
- [x] Log line `service added` with only `service_id`, `service_name`.
- [x] Binding and gate failures: 400, 415, 413 boundary, 401, 403 (FR-38, NFR-8).
- [x] Existing gate and CSRF tables run against real `createService` (`handler/router_test.go`, `helpers_test.go`).

### Repo-wide

- [x] `make check` passes, except `lint-md`: see Judgment calls (item 8), a finding in the task file that I may not edit.
- [x] `git diff go.mod go.sum`: only the `google/uuid` change.
- [x] Nothing outside allowed paths changed.

## Integration tests

- [x] Integration tests: not run: the task says none applies and nothing tagged `integration` is touched or added.

## Judgment calls

1. `usecase.ValidateServiceInput` and the type `usecase.ServiceSettings` are exported, because the validation tests live in `usecase_test` (as the other usecase tests do) and the task asks for the function to be tested directly.
2. The input shape is mine: `ServiceInput` holds a `CheckInput{Type, HTTP, TCP}`, and the four timings and two flags are pointers. A rule keeps `domain.JSONRule`, with a nil `FailingValue` for absent.
3. A `false` failing value counts as present; only nil is absent.
4. "Required" for names and values is checked for the empty string only; a header or JSON-rule field of spaces is accepted, as the task says nothing is trimmed except the messages.
5. A check type in another case (`HTTP`) is `invalid_value`, since the task says `http` or `tcp` exactly.
6. Every "Use N characters or fewer." message is built by one helper, so the string appears once. The 500 comes from `domain.MessageMaxLength`.
7. The default services spy in `helpers_test.go` returns an empty view. The gate and CSRF tables only assert "not 401 or 403" for the allowed case, so the 500 it gives there does not matter. No existing assertion changed.
8. `make check` fails at `lint-md` on `docs/tasks/create-service-api.md:216` (MD038, spaces in the code span `` `API ` ``). That is the task file, which no builder may edit, so I left it. Everything else in `make check` passes: golangci-lint, ESLint, Stylelint, shellcheck, and the rest of `lint-md` once this plan file was fixed. See the report for the remaining steps.
9. I ran `npm ci` in `frontend/` only to install the linters; nothing tracked changed.
10. `go mod tidy` moved `google/uuid` v1.6.0 to the direct block and changed nothing else; the `go` line is unchanged.
11. The handler tests take about 25 s because `newRouter` builds the router, and so parses the contract, for each case. I did not change the shared helper.
