# Plan: targets API

Branch: `feat/targets-api`. Prerequisite checked: `worker.Scheduler`, `worker.NewScheduler`, `ServiceService.StartChecks` exist on the default branch; no `worker/noop_scheduler.go`.

Paths are under `backend/internal/` unless noted. Integration tests: none apply to this task (no `integration`-tagged code is touched).

## Validation — `usecase/target_validation.go`, tests in `usecase/target_validation_test.go`

- [ ] Valid email and valid webhook (with headers) give no errors (FR-81) — `TestValidateTargetInput_Valid`
- [ ] `type` empty is `required` "Choose a type."; `ftp` is `invalid_value`; no other field reported (FR-81) — `TestValidateTargetInput_Type`
- [ ] `name` 50 pass, 51 `too_long`, 50 multi-byte pass, empty passes (FR-80, FR-87) — `TestValidateTargetInput_Name`
- [ ] Address: accepted/rejected rows, empty required, limit and limit+1, too-long beats invalid_format, trim (FR-82, FR-110) — `TestValidateTargetInput_Address`
- [ ] URL: accepted/rejected rows, empty required, limit and limit+1 (FR-89, FR-110) — `TestValidateTargetInput_URL`
- [ ] Headers: row count, empty name, name/value limits, empty value, errors in order (FR-92) — `TestValidateTargetInput_Headers`
- [ ] Header sent with an email target is ignored — `TestValidateTargetInput_EmailIgnoresHeaders`
- [ ] Refactored service header rule: `usecase/service_validation_test.go` passes unchanged

## Usecase — `usecase/target.go`, tests in `usecase/target_test.go`

- [ ] CreateTarget saves email and webhook rows with all fields (FR-14, FR-81, FR-88) — `TestCreateTarget_SavesRow`
- [ ] Invalid input is `ValidationError`, repository not called — `TestCreateTarget_Invalid`
- [ ] Limit of 3: third saved, fourth and duplicate-to-full are `ErrAlertListFull`, create after delete saved (FR-19) — `TestCreateTarget_Limit`
- [ ] Duplicate rules: email case, URL case, type, other service (FR-88, FR-18) — `TestCreateTarget_Duplicates`
- [ ] UpdateTarget replaces fields, keeps id, created_at, last_delivery_failed; sets updated_at (FR-15, FR-86) — `TestUpdateTarget_Replaces`
- [ ] UpdateTarget duplicate, own contact, full list, invalid input — `TestUpdateTarget_Duplicate` and siblings
- [ ] Unknown service / target / other service's target are `ErrNotFound` (FR-16, FR-17) — `TestTargets_NotFound`
- [ ] ListTargets order from repository and empty non-nil list — `TestListTargets`

## Repository — `repository/target.go`, tests in `repository/target_test.go`

- [ ] List: only the service's rows, order, every field, empty non-nil, unknown service `ErrNotFound` (FR-17) — `TestTargetRepository_List`
- [ ] Create saves email and webhook; unknown service `ErrNotFound` writes nothing (FR-14) — `TestTargetRepository_Create`
- [ ] Cap: fourth is `ErrAlertListFull`; duplicate to full list is `ErrAlertListFull`; other service not counted (FR-19) — `TestTargetRepository_CreateCap`
- [ ] Duplicate: type+value, email case, URL case, other service (FR-88, FR-18) — `TestTargetRepository_CreateDuplicate`
- [ ] Concurrency under `-race`: cap leaves exactly 3; same contact leaves one — `TestTargetRepository_ConcurrentCreate*`
- [ ] Update: replaces, keeps fields, type change, not-found cases, duplicate unchanged, own contact (FR-15, FR-86) — `TestTargetRepository_Update`
- [ ] Delete: one row, twice nil then `ErrNotFound`, other service's id, concurrent deletes (FR-16) — `TestTargetRepository_Delete`
- [ ] Deleting a service removes its targets (FR-70) — `TestTargetRepository_ServiceDeleteCascades`

## Handler — `handler/targets.go`, `handler/target_mapping.go`, tests in `handler/targets_test.go`, `handler/target_mapping_test.go`

- [ ] Each operation's success status and body, conforming to the contract (FR-14 to FR-17) — `TestTargets_Success*`
- [ ] 422 for missing type, `ftp`, address/url/headers[0].name; 400 for number address and non-JSON; nothing saved — `TestTargets_Create_Rejected`
- [ ] 404 for each of four; 409 `alert_list_full` and `target_duplicate` (create); 409 on update (FR-19, FR-88) — `TestTargets_Errors`
- [ ] Mapping both ways: webhook with headers, email, missing name, missing headers, header dropped for email — `TestToTargetInput`, `TestToAPITarget`
- [ ] Success log line has `service_id`, `target_id`, and none of address, URL, name, header — `TestTargets_LogHasNoContact`
- [ ] Router every-operation tests cover 401/403 for the four operations (NFR-8) — `TestRouter_*` (existing; confirm included)

## Wiring and repo-wide

- [ ] `domain` types: `TargetInput`, `TargetLimits`, `ErrAlertListFull`, `ErrTargetDuplicate`; `problem.go` rows; `server.go`, `main.go` wiring
- [ ] `make check` passes
- [ ] `git diff go.mod go.sum` empty
- [ ] Nothing outside the allowed paths changed

## Judgment calls

(filled in at the end)
