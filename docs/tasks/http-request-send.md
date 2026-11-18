# Task: http request send

One backend agent builds this end to end on its own branch; a separate verifier then checks it. Read `AGENTS.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Goal

An HTTP(S) check now sends the service's saved request: the query parameters, the headers and the body, not only the method and the URL. Until now `domain.HTTPCheck` carries a method, a URL and a timeout, so a saved header, query parameter or body is stored and never sent. After this task a check to a service with `Authorization` set sends it, a body of type JSON, text or form is sent with its content type, and the saved headers go with every redirected request (FR-58). This is the first of three probe tasks: JSON rules (`http-json-rules`) and the certificate options (`http-certificate-options`) follow.

Requirements covered:

- FR-35: the saved request (URL, query parameters, headers, body) is sent at each check.
- FR-37: the body type is none, JSON, plain text or URL-encoded form; it decides the content type the body is sent with.
- FR-36, in part: the method as saved; a body is sent with it whatever the method (tested for `GET`, `POST`, `PUT`, `PATCH` and `DELETE`; `CONNECT` and `TRACE` as the library sends them are not tested).
- FR-38, in part: a header, a query parameter list and a body at the limits of the configuration (up to 20 headers, 20 parameters, a body of 64 KB; the limits themselves are enforced on save by `create-service-api`) are sent whole.
- FR-58, in part: the saved request's headers are sent with each redirected request. (The limit of 3 redirects and its failure are `http-probe`'s and stay as they are.)
- FR-41, in part: sending the body is inside the attempt's timeout (by the context deadline; no test can show it, see "Verifier checks").

Out of scope:

- **JSON rules, reading the response body, FR-73** (`http-json-rules`) and **the certificate options** (`http-certificate-options`).
- **The save and edit forms for these rows, the save-time rules for a header** (milestone 3 form tasks; the backlog's `targets-api` line for a header with CR or LF).
- **A TCP check** (FR-49, FR-52): no TCP probe yet.
- **`testServiceCheck`** (FR-104 to FR-106): a stub; it will reuse this request building.
- **Any change to the contract, the migrations, the configuration or the wiring (`cmd/server/main.go`).** The prober's constructor does not change in this task.

## Prerequisite

`http-probe`, `check-sequence-and-state` and `create-service-api` are merged (they are). The builder checks first that these exist on the default branch, and stops to ask if any is missing (it never creates them):

- `adaptor/probe.HTTPProber` with `NewHTTPProber(maxRedirects int)` and `CheckHTTP(ctx, domain.HTTPCheck) (domain.CheckResult, error)` (`adaptor/probe/http.go`), its tests in `http_test.go`, and `domain.HTTPCheck{Method, URL, Timeout}` in `domain/check.go`.
- `worker.CheckRunner` (`worker/check_runner.go`) building a `domain.HTTPCheck` from a `domain.Service` and calling its `Prober` interface, with its tests and the fake prober in `worker/check_runner_test.go`.
- `domain.Service` with `HTTPQueryParams`, `HTTPHeaders` (`[]domain.NameValue`), `HTTPBodyType` (`domain.BodyType`), `HTTPBodyContent`, saved by `createService`; `domain.BodyTypeNone`, `BodyTypeJSON`, `BodyTypeText`, `BodyTypeForm`.
- `testutil.TargetServer` (scripted status, redirect, delay; records method, path, raw query, headers and body of every request; optional TLS), used as the receiver. `testutil` is not changed.

## Role and ownership

Role: Backend.

You may change only:

- `backend/internal/domain/check.go` (the new fields of `HTTPCheck`)
- `backend/internal/adaptor/probe/http.go`, `http_test.go`
- `backend/internal/worker/check_runner.go`, `check_runner_test.go` (the mapping from the service to the check, and its tests)

You may not change anything else: not `backend/cmd/server/main.go`, `backend/migration/**`, `backend/internal/api/**`, `backend/internal/handler/**`, the rest of `backend/internal/domain/**`, `backend/internal/usecase/**`, `backend/internal/repository/**`, `backend/internal/testutil/**`, `backend/internal/platform/config/**`, `pkg/**`, `.env.example`, `backend/go.mod`, `backend/go.sum`, `Makefile`, `frontend/**`, `docs/**` (except your own plan file, `docs/tasks/http-request-send.plan.md`). No configuration key is added or renamed.

Shared files this task touches, all owned by this task while it runs: `adaptor/probe/http.go` and its test, `domain/check.go`, `worker/check_runner.go` and its test. `http-json-rules` and `http-certificate-options` change the same files and wait for this one, in that order. Tasks that may run at the same time: the delivery lane (`delivery-retry`, `delivery-outcome`, `test-target`; none changes these files) and frontend tasks.

## Operations used

None. No operation of `docs/openapi.yaml` is implemented and no HTTP request is served. The saved values come from `ServiceInput.check` (`HttpCheck`: `query_params`, `headers`, `body`), which `createService` already saves; the contract is not changed.

## Behavior

### What exists

`HTTPProber.CheckHTTP` builds one request from the method, the URL and a deadline, sets `User-Agent: Monitory`, and judges the final response (2xx is healthy; anything else is a failure with the code of FR-61). It uses a client with no proxy, no keep-alive, no cookie jar, TLS 1.2 or newer with the system roots, and a redirect policy that fails with `too_many_redirects` after `maxRedirects` redirects. `worker.CheckRunner.Run` builds the `HTTPCheck` from `Method`, `URL` and the timeout only. `createService` saves `http_query_params`, `http_headers`, `http_body_type` and `http_body_content` (the body content is kept only when the type is not `none`).

### The request

`domain.HTTPCheck` gains four fields: `QueryParams []NameValue`, `Headers []NameValue`, `BodyType BodyType` and `BodyContent string`. The zero values (nil lists, an empty body type, an empty content) mean nothing is added, so every existing caller and test that builds an `HTTPCheck` with three fields keeps its behavior. An empty `BodyType` is the same as `none`.

`CheckHTTP` builds the request from them, in this order:

1. **The URL.** The query parameters are appended to the URL's own query, in the order given: the encoded `name=value` of each, joined by `&`; if the URL already has a non-empty query it is kept first and the parameters follow after one `&` (a query that already ends with `&` gets no second one); with none, or with a bare `?`, the query is the parameters alone. Names and values are encoded with `url.QueryEscape` (a space becomes `+`, `&` and `=` are percent-encoded), so a name or value cannot split a parameter. Two parameters with one name are both sent. A parameter with an empty value is sent as `name=`. An URL fragment is not sent (the library drops it). Nothing about the parameters is sorted.
2. **The body.** A body type of `json`, `text` or `form` sends `BodyContent` exactly as given, whatever the method (a `GET` with a body is sent with it), including the empty string (an empty body). `none` or empty sends no body. The content type is `application/json` for `json`, `text/plain` for `text` and `application/x-www-form-urlencoded` for `form`; there is no charset parameter. A type that is none of these is treated as `none`.
3. **The headers.** First `User-Agent: Monitory` and, with a body, the content type above; then the saved headers, each added with its name and value as saved (so a name is written in the library's canonical form, `x-api-key` going out as `X-Api-Key`). When a saved header is named `User-Agent` or `Content-Type` (compared ignoring case), the default of that name is not sent and every saved header of that name is sent instead, in the order given; any other name is added, and two saved headers with one name are both sent, in the order given. The order of headers with different names is not kept (HTTP headers are a map) and is not promised.
4. **The attempt.** Unchanged: one attempt under the check's timeout, which covers connecting, sending the request including the body, any redirects and (later) reading the response. Nothing saved is logged.

An invalid URL or a header that the library refuses to send (a name or value with CR or LF) makes the request fail to build or to send and is classified as before (`could_not_connect`); see "Known gaps".

### Redirects (FR-58)

Every redirected request (up to the limit) carries the saved headers, as in step 3, exactly as for the first request: the policy sets them again on the redirected request, replacing whatever the library copied or removed. In particular `Authorization`, `Cookie` and `WWW-Authenticate`, which the library strips when a redirect goes to another host, are sent again by the user's rule (FR-58 says the saved headers are sent with each redirected request; this task does not narrow it). The default `User-Agent: Monitory` is set on each hop unless a saved one exists. The default content type of a body is not added again by this task: the library drops `Content-Type` when it drops the body (`301`, `302`, `303` after a `POST`) and keeps it when it keeps the body (`307`, `308`); a saved `Content-Type`, `Content-Language`, `Content-Encoding` or `Content-Location` header is a saved header and is sent with each redirected request like any other, even on a request without a body. The library's own handling of the method and the body on a redirect is not changed: a `301`, `302` or `303` after a `POST` becomes a `GET` without a body, a `307` or `308` repeats the method and the body (the body is sent again). The limit and the failure (`too_many_redirects`) are unchanged.

### The runner (`worker.CheckRunner`)

`Run` fills the new fields of the `HTTPCheck` from the service by plain assignment: `QueryParams` from `HTTPQueryParams`, `Headers` from `HTTPHeaders`, `BodyType` from `HTTPBodyType`, `BodyContent` from `HTTPBodyContent`. Nothing is copied or normalised: a nil list stays nil and an empty body type stays empty (the unchanged assertion at `check_runner_test.go` compares whole `HTTPCheck` values). The same check is used for every attempt of the sequence. Nothing else in the runner changes (the retry rule, the waits and the recording are `check-sequence-and-state`'s).

### Known gaps

- **Credentials follow a redirect to another host,** by FR-58's wording. A saved `Authorization` or `Cookie` header is sent to wherever the chain goes (up to 3 hops). If that is not wanted, FR-58 is what to change.
- **A header the library controls has no effect.** `Host`, `Content-Length`, `Transfer-Encoding` and `Trailer` are set by the library; a saved header with one of those names is ignored (a service cannot override `Host` this way). Leading and trailing spaces of a value are dropped when the library writes it, and an empty `User-Agent` removes that header.
- **A header with CR or LF in a name or value** is accepted on save (length limits only; the backlog's `targets-api` line) and then fails every check as `could_not_connect`, because the library refuses to send it (a test pins this). The reason is misleading until the save-time rule exists. This differs from the webhook sender, which refuses such a header up front with its own reason: FR-61 has no reason for it, so the probe keeps its seven. An empty header name fails the same way; an empty query parameter name sends `=value`. Save-time validation rejects both; neither is handled here.
- **The content types** (`application/json`, `text/plain`, `application/x-www-form-urlencoded`, no charset) and the rule that a saved `User-Agent` or `Content-Type` replaces the default are this file's choices; neither the contract nor the requirements states them (the second mirrors the webhook sender).
- **Header order and name case are not kept** (see step 3).
- **A `GET` or `HEAD` with a body** is sent as saved; some servers refuse it, and the check then reports the answer.
- **The body is held in memory** (at most 64 KB by the save-time limit).
- **A `form` body is sent as typed:** the app does not check that it is URL-encoded.

## Structure

By `ARCHITECTURE.md` ("Interfaces", `adaptor/` holds no business rules). Names marked "new" are fixed by this file; others (unexported helpers, test doubles) are the builder's choice.

- `domain/check.go`: the four new fields of `HTTPCheck` (new).
- `adaptor/probe/http.go`: the request building (URL, body, headers) in unexported helpers, and the redirect policy that re-sets the saved headers. The client is still built once and reused; the redirect policy has access to the check's headers through the request (for example the original request's header set, or a closure over the check), so that the one shared client serves concurrent checks of different services without sharing their headers.
- `worker/check_runner.go`: the mapping only.

No new package, interface, dependency or configuration. The prober's constructor is unchanged.

## Dependencies

None. The standard library only; `go.mod` and `go.sum` do not change.

## Acceptance criteria

Every criterion is a test that fails if the behavior were removed. Probe tests use `testutil.TargetServer` and may use real deadlines of at most 200 ms (`TESTING.md`); runner tests use the fake prober and the fake clock as the existing ones do; no `time.Sleep`. Run them with `-race`.

**Probe (`adaptor/probe/http_test.go`)**

- Query parameters: two parameters appended to a URL with no query arrive as `a=1&b=2` in that order; appended to a URL that already has `x=1` they arrive as `x=1&a=1`, to one that ends in `?` as `a=1`, and to one whose query ends in `&` with no doubled `&`; 20 parameters arrive whole and in order; two with one name both arrive in order; an empty value arrives as `a=`; a name or value holding `&`, `=`, a space and a non-ASCII character arrives, decoded by the receiver, as the same text with no extra parameter; none given leaves the URL's query untouched; the fragment is not sent (FR-35, FR-38).
- Headers: two saved headers with different names arrive with their values as saved (a lower-case name arrives in its canonical form; no order across names is asserted); two with one name arrive as two values in order; a saved `User-Agent` replaces `Monitory` (the receiver sees one value), and two saved `User-Agent` headers arrive as two values with no `Monitory`; two saved `Content-Type` headers on a body arrive as two values with no default; a saved `Content-Type` replaces the default of a body; none given leaves only `User-Agent: Monitory`; a header value of 4,096 characters and 20 headers arrive whole (FR-35, FR-38).
- Body: type `json` arrives with `Content-Type: application/json` and the exact bytes; `text` with `text/plain`; `form` with `application/x-www-form-urlencoded`; `none` and the empty type arrive with no body and no `Content-Type`; a type `json` with empty content arrives as an empty body with its content type; an unknown type arrives as none; a body of 65,536 bytes arrives whole; a `POST`, a `PUT`, a `PATCH`, a `DELETE` and a `GET` each carry their body; a body with non-ASCII characters and a line break arrives byte for byte (FR-35, FR-37, FR-38).
- The attempt is unchanged: with all of the above set, a `200` is healthy, a `500` is `non_2xx_status` with the code, and a receiver that delays beyond a short timeout gives `timed_out` for a check with a body, as for one without. (That the body's sending is inside the timeout follows from the context deadline and is read by the verifier; the receiver reads the body before it delays, so no test shows it.)
- A saved header with CR or LF in its value, and one with an empty name, make the check fail as `could_not_connect` and send nothing (the known gap, pinned).
- Redirects (FR-58): with saved headers, a chain of two `302` redirects delivers the saved headers on all three requests (the library already does this on one host; the test guards against a regression); a redirect to a different host name (the receiver reached once as `127.0.0.1` and once as `localhost`) delivers a saved `Authorization`, a saved `Cookie` and a saved plain header (`X-Api-Key`) on the redirected request, where the library would have stripped the first two (this is the test that fails if the saved headers are not set again; the mutation "set them on the first request only" must fail it); a saved `Content-Type` is sent on the body-less `GET` after a `302` following a `POST`; the default `User-Agent` is on every hop; a `307` after a `POST` delivers the method, the body and the saved headers again; a `302` after a `POST` delivers a `GET` with no body and the saved headers; a chain longer than the limit still fails as `too_many_redirects`.
- Concurrency: two checks with different saved headers run at the same time on one prober under `-race`; each receiver sees only its own headers, redirected requests included.
- Every existing test of `http_test.go` passes with its checks unchanged (three-field `HTTPCheck` values).

**Runner (`worker/check_runner_test.go`)**

- A service with query parameters, headers, a body type and content gives the prober an `HTTPCheck` whose four new fields equal them, for the first attempt and for every retry (FR-35).
- A service with none of them (nil lists, an empty body type and content) gives an `HTTPCheck` equal to the three-field one the existing assertion expects: nil lists, an empty body type and an empty content (no copy, no normalisation).
- A TCP service and a service missing its method or URL behave as before; the existing tests pass with only their setup changed.

**Repo-wide**

- `make check` passes.
- `git diff` shows no change to `go.mod`, `go.sum`, `.env.example`, `platform/config`, `cmd/server/main.go`, a migration or any file outside the allowed paths; no configuration key was added.

## Verifier checks

- **Layering, by reading imports:** `adaptor/probe` imports `domain` and the standard library only; `worker/` imports `domain` and `pkg/clock` only.
- **One client, no sharing:** the client is built once; the redirect policy takes the saved headers from the request in flight (or a per-call closure), never from state shared between checks (the concurrent test shows it).
- **Where the rules live:** the runner only maps; the prober only builds and sends the request; no decision about whether a service is healthy was added.
- **Logs:** the prober and the runner log nothing; no header, query parameter or body reaches a log (`CONVENTIONS.md`, Logging).
- **Time:** no `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` outside tests, `pkg/` and `cmd/`.
- **Mutation checks to run:** sort or reverse the parameters; drop the existing query when appending; skip encoding; send the body only for `POST`; use `application/json` for every type; ignore a saved `Content-Type`; not set the saved headers again on a redirect; set them on the first request only; share a header set between concurrent checks; drop the `User-Agent` default; send an `none` body as empty with a content type; send a different body on retry. Each must fail at least one named test.
- **Inputs to try:** a URL with a query and a fragment plus parameters; a parameter name with `&`; a header named `authorization` and `Authorization` together; a body of 64 KB; a `GET` with a body; a redirect to another host name with `Authorization` set; a `307` and a `302` after a `POST`; a chain of 4 redirects with the limit 3; 20 headers of 4,096 characters; a header with CR (fails as `could_not_connect`, a known gap).
- **FR-41 by reading:** the request is built with the check's deadline context, so connecting, sending the body, redirects and the response share one deadline; no new context or timer was added.
- **What the verifier cannot prove:** behavior against real servers, proxies and other receivers; the body being sent inside the timeout; `CONNECT` and `TRACE` as the library sends them. Say so in the report.

## Stop and ask when

- The contract (`docs/openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency, a migration, a configuration key, a change to `cmd/server/main.go`, or an edit to a spec file.
- The standard library cannot re-set the saved headers on a redirected request without a design that shares state between concurrent checks, or the one shared client cannot keep each check's headers apart.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `ROLES.md` ("Handing back"): run `make check`, commit in small steps, push your branch (never the default branch), and finish with a short report: branch name, what changed, requirement IDs covered (with the test that shows each), dependency versions (none changed), and anything you were unsure about. No integration test applies; say so. Also list every judgment call this file did not settle.
