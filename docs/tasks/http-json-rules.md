# Task: http json rules

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

An HTTP(S) check now evaluates the service's JSON rules against the response body. A rule names a field and a value that means failure; the check fails when the rules say so, with the reason `json_rule_matched` and the field of the rule, or `invalid_or_missing_json` when the body cannot be judged. Until now a service can save rules and the probe ignores them, and the check never reads the response body. This is the second of three probe tasks (after `http-request-send`, before `http-certificate-options`). After it, a service whose `/health` answers `200` with `{"checks":{"db":{"status":"down"}}}` and a rule `checks.db.status` = `down` is unhealthy with the reason `json_rule_matched` and the field `checks.db.status`.

Requirements covered:

- FR-42: a check is healthy only if the final response arrives within the timeout, its status is 2xx, and no JSON rule matches (the rule half; the rest is `http-probe`'s).
- FR-44: several rules per service; a rule names a field and a failing value that is text or true/false.
- FR-45: a JSON number is compared as text; text matching is case-sensitive.
- FR-46: a field inside nested JSON is named with dots (`checks.db.status`).
- FR-47: the setting `any` fails the check when any rule matches, `all` only when all rules match.
- FR-48: with rules defined, a response that is not valid JSON, is empty, or lacks a rule's field fails the check.
- FR-73: the body is read only when the service has JSON rules, and at most `RESPONSE_BODY_MAX_BYTES` (default 65,536) of it; a larger body counts as not valid JSON. The limit is passed in from the configuration.
- FR-41, in part: reading the response body is inside the attempt's timeout.
- FR-61, in part: the reasons `json_rule_matched` (with the rule's field) and `invalid_or_missing_json` are produced; a matching rule beats a non-2xx status, and, by the user's decision, a non-2xx status beats invalid or missing JSON.
- FR-69 is the save-time limit of 10 rules (`create-service-api`); not changed here.

Out of scope:

- **Saving rules and the form rows for them** (`createService`, `updateService`, the service form): the save-time validation exists; the form is a milestone 3 frontend task.
- **The certificate options** (`http-certificate-options`) and **sending the saved request** (`http-request-send`, which this task builds on).
- **The wording of the failure reasons on screen** (FR-61 row of the backlog): frontend.
- **`testServiceCheck`** (FR-104 to FR-106): a stub; it will show the status, duration and body and reuse this evaluation.
- **A TCP check**, **array indexing in a path**, **a field name that holds a dot**: see "Known gaps".
- **Any change to the contract, the migrations or the configuration keys.** `RESPONSE_BODY_MAX_BYTES` exists and is read into `config.Limits.ResponseBodyMaxBytes` and used nowhere yet. The existing probe tests pass 65,536 as the second argument of `NewHTTPProber`; the constructor does not validate it (the configuration guarantees at least 1).

## Prerequisite

`http-request-send` is merged. The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `domain.HTTPCheck` with `Method`, `URL`, `Timeout` and the fields `http-request-send` adds (`QueryParams`, `Headers`, `BodyType`, `BodyContent`); `adaptor/probe.HTTPProber` building the request from them and re-setting the saved headers on redirects; `worker.CheckRunner` mapping the service into the check by plain assignment.
- `domain.JSONRule{Field string, FailingValue any}` (`FailingValue` is a string or a bool; nil when absent), `domain.JSONRuleMode` (`any`, `all`; empty is `any`), `domain.Service.JSONRules` and `JSONRuleMode` (`domain/service.go`); `domain.FailureJSONRuleMatched` and `domain.FailureInvalidOrMissingJSON` (`domain.FailureCode`); `domain.CheckFailure.JSONRuleField *string` (`domain/check.go`).
- The state side: `usecase.CheckResultService` stores `JSONRuleField` of a failure and the handler returns it as `json_rule_field` (they do; this task does not change them).
- `config.Limits.ResponseBodyMaxBytes` (`RESPONSE_BODY_MAX_BYTES`, default 65,536, minimum 1) in `platform/config` and `.env.example`.
- `testutil.TargetServer` (scripted status, body, delay, redirect) as the receiver; `testutil` is not changed.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/domain/check.go` (the new fields of `HTTPCheck`)
- `backend/internal/adaptor/probe/http.go`, `http_test.go`; a new file `backend/internal/adaptor/probe/json_rules.go` and its test `json_rules_test.go` for the evaluation
- `backend/internal/worker/check_runner.go`, `check_runner_test.go` (the mapping)
- `backend/cmd/server/main.go` (the one call that builds the prober)

You may not change anything else: not `backend/migration/**`, `backend/internal/api/**`, `backend/internal/handler/**`, the rest of `backend/internal/domain/**`, `backend/internal/usecase/**`, `backend/internal/repository/**`, `backend/internal/testutil/**`, `backend/internal/platform/config/**`, `pkg/**`, `.env.example`, `backend/go.mod`, `backend/go.sum`, `Makefile`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/http-json-rules.plan.md`). No configuration key is added or renamed.

Shared files this task touches, all owned by this task while it runs: `adaptor/probe/http.go` and its test, `domain/check.go`, `worker/check_runner.go` and its test, and `cmd/server/main.go` (its prober line; the delivery lane also edits other lines of `main.go`, and the user resolves a conflict there when merging). `http-certificate-options` changes the same probe files and waits for this one. Tasks that may run at the same time: the delivery lane (`delivery-retry`, `delivery-outcome`, `test-target`; `main.go` only in common) and frontend tasks.

## Operations used

None. No operation of `docs/openapi.yaml` is implemented. The reasons it produces are the contract's `FailureReason` codes `json_rule_matched` (with `json_rule_field`) and `invalid_or_missing_json`, which the contract and `domain.FailureCode` already have.

## Behavior

### What exists

`HTTPProber.CheckHTTP` makes one attempt under the check's deadline and judges the final response by its status alone (2xx healthy, otherwise `non_2xx_status` with the code); it closes the response body without reading it. After `http-request-send` it sends the saved request. `createService` validates and saves up to `MAX_JSON_RULES` rules (a non-empty field and a failing value, a string or a bool) and the mode. The state side (`applyCheckResult`, `listServices`, `getService`) stores and returns a failure's `JSONRuleField` already.

### The check

`domain.HTTPCheck` gains `JSONRules []JSONRule` and `JSONRuleMode JSONRuleMode`. `NewHTTPProber` takes the body limit as a second argument: `NewHTTPProber(maxRedirects, maxBodyBytes int)`; `main.go` passes `cfg.Limits.MaxRedirects` and `cfg.Limits.ResponseBodyMaxBytes`; every other caller (the probe tests) is updated. The runner fills the two new fields from the service by plain assignment, as it did for the others (an empty mode stays empty and means `any`).

With **no rules** (`len(JSONRules) == 0`; a service saved without rules reaches the probe with an empty, non-nil list and the mode `any`, so nil is not the test) nothing changes: the body is not read and the judgment is by status alone (FR-73).

With **rules**, one attempt does this, all inside the check's deadline (the same context that covers connecting, sending and any redirects):

1. Get the final response as before (a failure to get one is classified as before: `timed_out`, `certificate_problem`, `too_many_redirects`, `could_not_connect`, or the caller's context error).
2. **Read the body,** whatever the status, at most `maxBodyBytes` bytes: read up to `maxBodyBytes + 1` bytes; seeing more than `maxBodyBytes` means the body is too large. The rest is not read. A read that fails is classified with the same rule `classify` uses (by the state of the deadline context and the caller's context, not by the error's identity): the deadline passed is `timed_out`, whatever the status (the attempt did not finish in time, FR-41); the caller's context ended is the context's error; any other read error (for example the connection closed in the middle of a body that declared its length or is chunked: the library reports an unexpected EOF) is `non_2xx_status` with the code when the status is not 2xx (the same precedence as an unparseable body, by the user's decision) and `could_not_connect` when it is 2xx. A response without a declared length that is simply closed is a complete body.
3. **Parse** the bytes as one JSON value: the whole body, leading and trailing white space allowed, nothing else after the value (use a `json.Decoder` with `UseNumber`, then a second `Decode` that must return `io.EOF`; `Unmarshal` cannot keep the number text, and a single `Decode` accepts trailing data). Numbers keep their text as written in the body (`1.50` stays `1.50`; `1e3` stays `1e3`). The body counts as **not valid JSON** when it is empty, when it does not parse as the standard library parses it (a leading byte-order mark, nesting deeper than the library allows and trailing data all fail it), and when it is too large. Escapes in strings are decoded before comparing (`"\u0064own"` matches `down`), and invalid UTF-8 in a string is replaced by the library and does not make the body invalid. A body whose top-level value is not an object (an array, a string, a number) parses, and every rule's field is then missing.
4. **Find each rule's field** by its path: split the rule's `field` on `.`; the first segment is a key of the top-level object, each further segment a key of the object found so far. Keys are matched exactly (case-sensitive). A segment that is empty (`a..b`, a leading or trailing dot), a key that is not there, or a step that reaches anything that is not an object (an array, a string, a number, `true`, `false`, `null`) means the field is **missing**. A key that appears twice in an object takes the last one. A value that is itself an object or an array is a value (not missing) that never matches.
5. **A rule matches** only when its field is present and equal to the rule's failing value:
   - a failing value that is a string matches a JSON string with exactly the same characters, a JSON number whose text as written equals the string, and JSON `null` when the string is `null` (the text `null`); it never matches `true` or `false`;
   - a failing value that is `true` or `false` matches the JSON boolean of that value and nothing else (the string `"true"` is a different rule);
   - the comparison is by characters, case-sensitive, with no trimming.
6. **The decision by mode:** with `any` (or an empty mode) the rules fail the check when at least one matches; with `all` only when every rule matches. With `all`, a rule whose field is missing does not match.
7. **The result,** by the first rule that applies, in this order:
   1. The body is valid JSON and the rules fail the check by step 6: unhealthy, `json_rule_matched`, with `JSONRuleField` the `field` of the first matching rule in the order the rules were saved (also under `all`, where every rule matched). This is chosen whatever the status (FR-61: a matching rule beats a non-2xx status).
   2. The status is not 2xx: unhealthy, `non_2xx_status` with the code (the user's decision: it beats invalid or missing JSON).
   3. The status is 2xx and the body is not valid JSON, or at least one rule's field is missing: unhealthy, `invalid_or_missing_json` (FR-48). This includes a missing field under `any` when no other rule matched, and under `all` when one rule matched and another rule's field is missing. A field that is present and differs is not missing: under `all` with every field present and one not matching, the check is healthy.
   4. Otherwise healthy.

The status, the redirects, the certificate rules, the timeout and the classification of a failure to get a response are as `http-probe` and `http-request-send` made them. A `HEAD` request has no body and fails as `invalid_or_missing_json` when rules exist (a 2xx status), by the rule above.

### The runner

`worker.CheckRunner.Run` is unchanged except for the mapping of the two fields. The retry rule, the waits and the recording are `check-sequence-and-state`'s: a check that fails as `json_rule_matched` or `invalid_or_missing_json` is retried like any other failure (FR-51), and the last attempt's result, with its `JSONRuleField`, is recorded.

### Known gaps

- **No array indexing.** A path that meets an array is a missing field (the user's decision); `items.0.status` cannot be written.
- **A key that contains a dot cannot be addressed:** the path is split on every dot.
- **A string rule matches a number or `null` by text,** and a boolean rule only a JSON boolean. A JSON `true` is not matched by the string `"true"` (the user's decision; the contract says a failing value is text or true/false).
- **Compressed bodies:** the HTTP library decompresses transparently only when the request has no `Accept-Encoding` header of its own. A saved `Accept-Encoding: gzip` header (which `http-request-send` sends) makes the body arrive compressed, so it is not valid JSON and the check fails as `invalid_or_missing_json`. Without it, the limit counts the decompressed bytes read. The verifier cannot prove this against a real server.
- **Edges of "valid JSON"** are those of the standard library (a byte-order mark is not accepted, invalid UTF-8 is replaced, very deep nesting is an error).
- **A body just over the limit** is "not valid JSON" even when its first 64 KB are a valid prefix of a JSON value; the rest is not read, so such a response is unhealthy as `invalid_or_missing_json` (or `non_2xx_status`) and the admin cannot tell it from a broken one by the reason alone.
- **Reading a large body that arrives slowly** is bounded by the timeout only.
- **The invalid-JSON reason and the status:** a non-2xx response with an unparseable body is `non_2xx_status`, hiding the missing JSON (the user's decision).
- **A failing value type outside string and bool** is refused by the handler's mapping on save (not by the usecase validation, which only requires a value); if one reached the probe it would never match. The usecase trims a rule's field on save; the failing value is kept as typed.

## Structure

By `ARCHITECTURE.md` ("Interfaces"; `adaptor/` holds no business rules: the evaluation is the protocol-level reading of a response, and the decision to count a service unhealthy stays with the usecase that records the result).

- `domain/check.go`: `JSONRules` and `JSONRuleMode` on `HTTPCheck` (new fields).
- `adaptor/probe/json_rules.go` (new): a pure function that, given the body bytes (or "too large"), the rules and the mode, returns whether the rules fail the check, the field of the first matching rule, and whether the body was not valid JSON or a field was missing. It reads no network and no clock; it is tested on its own. The reading of the body and the order of the result stay in `http.go`.
- `adaptor/probe/http.go`: the constructor argument, the body read under the deadline, the result order.
- `worker/check_runner.go`: the mapping. `cmd/server/main.go`: the second constructor argument.

No new package, interface, dependency or configuration.

## Dependencies

None. The standard library only (`encoding/json`, `io`); `go.mod` and `go.sum` do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. The evaluation function is tested directly (a table); the probe tests use `testutil.TargetServer` and may use real deadlines of at most 200 ms (`TESTING.md`); a body that arrives slowly is served by a small `httptest` server the test file starts itself (the target server writes the whole body after its delay); runner tests use the fake prober and the fake clock; no `time.Sleep`. Run them with `-race`.

**Evaluation (`adaptor/probe/json_rules_test.go`, a table)**

- A string rule matches the same string and not a different case (`Down` against `down`), not a prefix, not with surrounding spaces (FR-45).
- A numeric JSON value matches the string of its text as written: `3` matches `"3"`, `1.50` matches `"1.50"` and not `"1.5"`, `1e3` matches `"1e3"` and not `"1000"`; a number never matches a boolean rule (FR-45).
- A boolean rule matches only a JSON boolean of the same value; the string `"true"` does not match JSON `true`, and a boolean rule does not match the string `"true"`.
- JSON `null` matches the string `null` and nothing else, and is not a missing field.
- A nested path `checks.db.status` finds its value; a missing key, an empty segment (`a..b`, `.a`, `a.`), a step into an array, into a string, into a number, into `true` and into `null` each mean the field is missing; a value that is an object or an array is present and matches no rule; the top-level value being an array, a string or a number makes every field missing; a duplicate key takes the last value (FR-46).
- Mode `any` fails when one of three rules matches and not when none does; mode `all` fails only when all three match, and not when one field is missing (the result is then "field missing", not a match); with `all`, every field present and one not matching is neither a match nor missing; an empty mode is `any` (FR-47).
- A string in the body written with an escape (`"\u0064own"`) matches the rule `down`.
- The first matching rule in saved order is the reported field, under `any` and under `all`.
- Not valid JSON: an empty body, a body of only white space, `{`, text, a body that starts with a byte-order mark, and a valid value followed by more text or by another value (`{} x`, `{}{}`, `{} {}`) are not valid; white space around a valid value is fine; a body that is too large is not valid whatever its content (FR-48, FR-73).

**Probe (`adaptor/probe/http_test.go`)**

- A `200` with `{"status":"ok"}` and a rule `status` = `down`: healthy. With `{"status":"down"}`: unhealthy, `json_rule_matched`, `JSONRuleField` `status`, `HTTPStatus` nil (FR-42, FR-44).
- A `500` with a matching body and a rule: `json_rule_matched` (the rule beats the status). A `500` with a body that does not match, and a `500` with no JSON body: `non_2xx_status` with the code (the user's decision). A `200` with no JSON body, with an empty body, and with a body that lacks the field: `invalid_or_missing_json` (FR-48, FR-61).
- No rules: a `200` with a 1 MB body and an empty, non-nil rule list is healthy; the same response with a rule gives `invalid_or_missing_json` (the body is too large). That the body is not read when there are no rules is proved by the slow-body case below, where the same slow response is healthy without rules (FR-73); the mutation "read the body when there are no rules" must fail it.
- The limit: a body of exactly `maxBodyBytes` bytes that is valid JSON and does not match is healthy; one byte more is `invalid_or_missing_json` (also when the first `maxBodyBytes` bytes are a valid prefix); the limit used is the one passed to `NewHTTPProber` (test with 64 and with 1,024) (FR-73).
- Reading is inside the timeout: a body that arrives slowly (headers at once, the body after longer than the timeout) gives `timed_out` for a check with rules and a healthy result for one without rules; a body cut off in the middle (a declared `Content-Length` or chunked framing, then the connection closed) gives `could_not_connect` for a 2xx and `non_2xx_status` for a `500`; a `500` whose body arrives slower than the timeout gives `timed_out`; a caller's context cancelled during the read returns the context's error (FR-41, FR-61).
- Redirects: the rules judge the final response's body after a redirect; the status of an earlier hop is not read.
- A `HEAD` check with rules and a 2xx status fails as `invalid_or_missing_json`.
- Modes: `any` with two rules, one matching: unhealthy; `all` with the same body: healthy (the second field is present and does not match); `all` with both matching: unhealthy with the first rule's field (FR-47).
- Every existing test of `http_test.go` passes with only its setup changed (the second constructor argument); no assertion is changed or removed.

**Runner (`worker/check_runner_test.go`)**

- A service with rules and a mode gives the prober an `HTTPCheck` whose `JSONRules` and `JSONRuleMode` equal them, for every attempt; a service with none gives nil rules and an empty mode (no copy, no normalisation).
- A result with `json_rule_matched` and a rule field is recorded as given after the last attempt, and a failing first attempt followed by a healthy second one is recorded healthy (the existing retry rule, shown with the new reason).

**Wiring (`cmd/server/main.go`, read by the verifier; there is no test of `main`)**

- `probe.NewHTTPProber` gets `cfg.Limits.MaxRedirects` and `cfg.Limits.ResponseBodyMaxBytes`.

**Repo-wide**

- `make check` passes.
- `git diff` shows no change to `go.mod`, `go.sum`, `.env.example`, `platform/config`, a migration or any file outside the allowed paths; no configuration key was added.

## Verifier checks

- **Layering, by reading imports:** `adaptor/probe` imports `domain` and the standard library only; `worker/` imports `domain` and `pkg/clock` only.
- **Where the rules live:** the evaluation function has no network or clock; `http.go` decides the order of the result; nothing about alerts or status transitions was added.
- **No hardcoded limit:** there is no literal `65536`, `64 * 1024` or `1 << 16` in the non-test probe code; the limit is the constructor's argument.
- **FR-73 by reading:** the body is read only inside the branch where the check has rules; the read is capped at `maxBodyBytes + 1` bytes (`io.LimitReader` or equal); nothing reads the whole body.
- **FR-41 by reading:** the body read uses the same deadline context as the request; no new context or timer.
- **Logs:** the prober logs nothing; no body, field or value reaches a log (`CONVENTIONS.md`, Logging).
- **Time:** no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` outside tests, `pkg/` and `cmd/`.
- **Mutation checks to run:** compare case-insensitively; compare a number by its value; let a string rule match `true`; treat `null` as missing; read a non-2xx body only after the status check; make `non_2xx_status` beat a matching rule; make `invalid_or_missing_json` beat `non_2xx_status`; make `all` act as `any`; report the last matching rule's field; read the body when there are no rules; drop the limit; read the whole body; count an over-limit body as valid; treat a trailing garbage as valid; allow an array step; let a missing field not count under `any` when nothing matched; read the body outside the deadline. Each must fail at least one named test.
- **Inputs to try:** a nested field three deep; a number as the failing text; a `true` rule against `true` and against `"true"`; a body of 65,536 and 65,537 bytes; an empty `200`; a `204` with rules; a `500` with an HTML body; a redirect to a JSON endpoint; a mode `all` with one missing field; a body that is a JSON array; a body that arrives slowly; two rules where the second matches.
- **What the verifier cannot prove:** behavior against real services and compressed responses; say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, a configuration key, or an edit to a spec file; in particular a change to `usecase/` or the handler to carry the rule's field (they already do).
- `http-request-send` is not merged, or a name this file takes from it is missing.
- The standard library cannot read the body under the check's deadline without a design that changes how a failure to get a response is classified.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
