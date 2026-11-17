# Plan: targets API

Branch: `feat/targets-api`. Prerequisite checked: `worker.Scheduler`, `worker.NewScheduler`, `ServiceService.StartChecks` exist on the default branch; no `worker/noop_scheduler.go`.

Paths are under `backend/internal/` unless noted. Integration tests (`make test-integration`): not run: the task adds no integration-tagged test and touches no code that has one (acceptance criteria: "No integration test is needed").

## Validation — `usecase/target_validation.go`, tests in `usecase/target_validation_test.go`

- [x] Valid email and valid webhook (with headers) give no errors (FR-81) — `TestValidateTargetInput_Valid`
- [x] `type` empty is `required` "Choose a type."; `ftp` is `invalid_value`; no other field reported (FR-81) — `TestValidateTargetInput_Type`
- [x] `name` 50 pass, 51 `too_long`, 50 multi-byte pass, empty passes (FR-80, FR-87) — `TestValidateTargetInput_Name`
- [x] Address: accepted/rejected rows, empty required, limit and limit+1, too-long beats invalid_format, trim (FR-82, FR-110) — `TestValidateTargetInput_Address`
- [x] URL: accepted/rejected rows, empty required, limit and limit+1 (FR-89, FR-110) — `TestValidateTargetInput_URL`
- [x] Headers: row count, empty name, name/value limits, empty value, errors in order (FR-92) — `TestValidateTargetInput_Headers`
- [x] Header sent with an email target is ignored — `TestValidateTargetInput_EmailIgnoresHeaders`
- [x] Refactored service header rule: `usecase/service_validation_test.go` passes unchanged

## Usecase — `usecase/target.go`, tests in `usecase/target_test.go`

- [x] CreateTarget saves email and webhook rows with all fields (FR-14, FR-81, FR-88) — `TestCreateTarget_SavesRow`
- [x] Invalid input is `ValidationError`, repository not called — `TestCreateTarget_Invalid`
- [x] Limit of 3: third saved, fourth and duplicate-to-full are `ErrAlertListFull`, create after delete saved (FR-19) — `TestCreateTarget_Limit`
- [x] Duplicate rules: email case, URL case, type, other service (FR-88, FR-18) — `TestCreateTarget_Duplicates`
- [x] UpdateTarget replaces fields, keeps id, created_at, last_delivery_failed; sets updated_at (FR-15, FR-86) — `TestUpdateTarget_Replaces`
- [x] UpdateTarget duplicate, own contact, full list, invalid input — `TestUpdateTarget_Duplicate` and siblings
- [x] Unknown service / target / other service's target are `ErrNotFound` (FR-16, FR-17) — `TestTargets_NotFound`
- [x] ListTargets order from repository and empty non-nil list — `TestListTargets`

## Repository — `repository/target.go`, tests in `repository/target_test.go`

- [x] List: only the service's rows, order, every field, empty non-nil, unknown service `ErrNotFound` (FR-17) — `TestTargetRepository_List`
- [x] Create saves email and webhook; unknown service `ErrNotFound` writes nothing (FR-14) — `TestTargetRepository_Create`
- [x] Cap: fourth is `ErrAlertListFull`; duplicate to full list is `ErrAlertListFull`; other service not counted (FR-19) — `TestTargetRepository_CreateCap`
- [x] Duplicate: type+value, email case, URL case, other service (FR-88, FR-18) — `TestTargetRepository_CreateDuplicate`
- [x] Concurrency under `-race`: cap leaves exactly 3; same contact leaves one — `TestTargetRepository_ConcurrentCreate*`
- [x] Update: replaces, keeps fields, type change, not-found cases, duplicate unchanged, own contact (FR-15, FR-86) — `TestTargetRepository_Update`
- [x] Delete: one row, twice nil then `ErrNotFound`, other service's id, concurrent deletes (FR-16) — `TestTargetRepository_Delete`
- [x] Deleting a service removes its targets (FR-70) — `TestTargetRepository_ServiceDeleteCascades`

## Handler — `handler/targets.go`, `handler/target_mapping.go`, tests in `handler/targets_test.go`, `handler/target_mapping_test.go`

- [x] Each operation's success status and body, conforming to the contract (FR-14 to FR-17) — `TestTargets_Success*`
- [x] 422 for missing type, `ftp`, address/url/headers[0].name; 400 for number address and non-JSON; nothing saved — `TestTargets_Create_Rejected`
- [x] 404 for each of four; 409 `alert_list_full` and `target_duplicate` (create); 409 on update (FR-19, FR-88) — `TestTargets_Errors`
- [x] Mapping both ways: webhook with headers, email, missing name, missing headers, header dropped for email — `TestToTargetInput`, `TestToAPITarget`
- [x] Success log line has `service_id`, `target_id`, and none of address, URL, name, header — `TestTargets_LogHasNoContact`
- [x] Router every-operation tests cover 401/403 for the four operations (NFR-8) — `TestRouter_*` loop over `operations(t)`, which reads the paths from the contract, so the four target routes are included; plus `TestTargets_GateFailuresNeverReachTheSpy`

## Wiring and repo-wide

- [x] `domain` types: `TargetInput`, `TargetLimits`, `ErrAlertListFull`, `ErrTargetDuplicate`; `problem.go` rows; `server.go`, `main.go` wiring
- [x] `make check`: every step passes except `lint-md`, which fails on `docs/tasks/delete-service-dialog.md:80` (MD038, not my file, outside my paths). Ran `lint-backend`, `lint-frontend`, `lint-css`, `lint-shell`, `openapi-lint`, `test` (race) and `build` separately: all pass. Markdown lint reports nothing for my plan file.
- [x] `git diff go.mod go.sum` empty
- [x] Nothing outside the allowed paths changed

## Judgment calls

- **A response wrapper for create and update.** The generated `CreateTarget201JSONResponse` and `UpdateTarget200JSONResponse` are defined types of `api.Target`, so they lose its `MarshalJSON` and answer only `{"id", "last_delivery_failed"}` (the conformance check caught this). `handler/targets.go` has a small `targetResponse` that implements both `Visit...Response` methods and encodes the `api.Target`. I did not touch generated code. `ListTargets200JSONResponse` is a slice of `Target`, so it is fine.
- **`TargetService` returns the saved `domain.Target`** from `CreateTarget` and `UpdateTarget` (the task fixed the method names, not the return types).
- **Header rule extraction:** `validateHeaderRows(v, field, emptyName, rows, headerLimits)` in `service_validation.go`, with a private `headerLimits` struct; the service's behavior and tests are unchanged.
- **Repository `Update`** reads the row by `id` and `service_id` first (for `ErrNotFound`), then writes with `Select(...).Updates(struct)` so the headers' JSON serializer runs, then re-reads the stored row. Updates with a map were avoided for that reason.
- **No test for "same text as email and as webhook".** No text passes both validators (a webhook URL starts with `http`, an address cannot hold `://`), so it is not reachable through the usecase; it is covered at the repository, where `type` is part of the unique index.
- **Test names** differ a little from the ones I planned in the checklist; each criterion has its test.
- **`make check` and `lint-md`:** see the item above. I did not edit `docs/tasks/delete-service-dialog.md` (outside my paths). `npm ci` was run in `frontend/` to run the frontend steps; it changes nothing tracked.
