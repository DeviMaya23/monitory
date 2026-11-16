# Plan: create-service API

Branch: `feat/create-service-api`. Paths are under `backend/internal/` unless noted.

## Acceptance criteria

### ID
- [ ] `NewID`: 36 chars, version 7, RFC 4122 variant, two calls differ. File `domain/id.go`; test `domain/id_test.go`.

### Validation (`usecase/service_validation.go`; test `usecase/service_validation_test.go`, table-driven, non-default limits)
- [ ] Valid minimal HTTP and TCP inputs have no errors (FR-6, FR-33).
- [ ] Name: required, limit and one past, characters not bytes (FR-59).
- [ ] `check.type`: required, `invalid_value`, no other `check.*` errors (FR-33).
- [ ] Method: nine pass, required, invalid (FR-36).
- [ ] URL: required, invalid_format, scheme case, length with query params, multi-byte (FR-38, FR-74).
- [ ] Query params: limit, too_many, empty name index (FR-38).
- [ ] Headers: row limit, name required, name and value limits, empty value ok (FR-38).
- [ ] Body: absent is none, invalid type, byte limit, none type too (FR-37, FR-38).
- [ ] JSON rules: limit, field required, failing_value required, string and bool, mode (FR-44, FR-47, FR-69, FR-74).
- [ ] Certificate options (FR-34, FR-50, FR-64, FR-74).
- [ ] TCP host and port (FR-74).
- [ ] Settings: defaults, one below Min and above Max, exact messages (FR-57).
- [ ] Budget: equal passes, one over fails, retry 0, absent when out of range (FR-56).
- [ ] Messages: 500/501, trim, absent (FR-65).
- [ ] Several problems at once, in order, each field once (FR-12).

### Service usecase (`usecase/service.go`; test `usecase/service_test.go`, fakes in `usecase/fakes_test.go`)
- [ ] Valid HTTP input returns the expected ServiceView and the fake repo holds it (FR-6, FR-20, FR-68).
- [ ] TCP input saved (FR-33).
- [ ] Everything given is saved as given (FR-35, FR-37, FR-44, FR-47).
- [ ] Repository receives configured `MaxServices`.
- [ ] Scheduler called exactly once, after the write (FR-67 seam).
- [ ] Rejected input: ValidationError, nothing saved, no scheduler call, against a baseline (FR-12).
- [ ] Name-taken and limit sentinels returned unchanged, no scheduler call (FR-59, FR-60).

### Repository (`repository/service.go`; test `repository/service_test.go`, real SQLite)
- [ ] Full HTTP round trip (FR-35, FR-37, FR-44).
- [ ] TCP round trip (FR-33).
- [ ] State row created.
- [ ] Reopen keeps service and state (NFR-1).
- [ ] Case and Unicode-case name clash; trailing space accepted (FR-59).
- [ ] Limit 2 reached; duplicate name at limit gives limit error (FR-60).
- [ ] Concurrency for limit and for same name (FR-59, FR-60).
- [ ] Other failure (duplicate id) is neither sentinel, nothing left; limit lowered below count.

### Handler (`handler/services.go`, `handler/service_mapping.go`; tests `handler/services_test.go`, `handler/service_mapping_test.go`)
- [ ] 201 shape for HTTP and TCP, no Location (FR-6).
- [ ] Request reaches spy as domain input; null = absent (FR-35, FR-44).
- [ ] check missing / without type / ftp reach spy, not 400.
- [ ] 400 cases and pass-through cases for check shapes.
- [ ] Other-type properties dropped.
- [ ] 409 for both sentinels (FR-59, FR-60).
- [ ] 422 with several fields (FR-12).
- [ ] 500 with no internal text.
- [ ] Log line `service added` with only `service_id`, `service_name`.
- [ ] Binding and gate failures: 400, 415, 413 boundary, 401, 403 (FR-38, NFR-8).
- [ ] Existing gate and CSRF tables run against real `createService` (`handler/router_test.go`, `helpers_test.go`).

### Repo-wide
- [ ] `make check` passes.
- [ ] `git diff go.mod go.sum`: only the `google/uuid` change.
- [ ] Nothing outside allowed paths changed.

## Integration tests
- [ ] not run: the task states no integration test applies (nothing tagged `integration` is touched).

## Judgment calls
(filled in at the end)
