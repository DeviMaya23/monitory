# Architecture

> Applies to all implementation agents.

## Frontend

### Directory structure

```text
frontend/src/
  features/          ← feature-scoped code, one folder per UI area
    <feature>/
      components/    ← components owned by this feature
      hooks/         ← hooks owned by this feature
      lib/           ← feature-local helpers (no other feature imports them)
  app-shell/         ← top-level layout, routing, session handling, toasts
    lib/             ← shell-local helpers
  lib/               ← shared domain layer used across features
    api/             ← API client, thin wrappers, generated `schema.d.ts`
    config.ts        ← named constants (the refresh interval, FR-95)
  components/ui/     ← shared design-system primitives; the only place that imports Base UI
  hooks/             ← generic hooks with no feature dependencies
  pages/             ← thin route entry points
  styles/            ← `tokens.css` and global styles, copied from `docs/design/`
  assets/            ← static assets
```

Features, one per UI area:

| Feature | Screen | Route |
|---|---|---|
| `sign-in` | Sign-in | `/sign-in` |
| `service-list` | Admin dashboard, delete confirmation, public view switch | `/` |
| `service-form` | Add or edit a service, test check | `/services/new`, `/services/:serviceId` |
| `alert-list` | A service's alert list, target form, test alert | `/services/:serviceId/alerts` |
| `public-status` | Public dashboard | `/status` |

### Where new code goes

- **`features/<feature>/`**: default for anything specific to one UI area. New components, hooks and helpers live here, not in the top-level folders.
- **`app-shell/`**: only the shell layout and logic that coordinates across features (the 401 redirect to sign-in, the CSRF token, toasts). No feature work here.
- **`lib/`**: shared domain modules used by more than one feature. Keep them feature-agnostic. A helper used by one feature belongs in that feature's `lib/`.
- **`components/ui/`, `hooks/`, `pages/`**: stay top-level (design-system primitives, dependency-free hooks, thin route entry points).

### Features do not import each other

A file in one feature never imports from another feature. When two features need the same thing, promote it: UI to `components/`, logic to `lib/`. Pages and `app-shell/` may import from any feature, since they assemble features.

### API types

Request and response types are generated from `docs/openapi.yaml` into `src/lib/api/schema.d.ts` (types only; API calls are thin hand-written wrappers). Never write a type that mirrors an API shape by hand. If the generated type is wrong, the contract is wrong: ask.

### Naming and promotion

- A feature directory whose UI concern maps to a shared domain module gets a distinct name (`service-list`, not `services`) so the feature and the `lib/` module stay separately greppable.
- A feature-local component, hook or helper is promoted to the shared layer only once a second feature needs it, and it moves at that moment, not before.

### Build output

`npm run build` writes to `backend/internal/web/dist/`. That directory is gitignored except for a committed placeholder page, so the backend builds without the frontend.

---

## Backend

### Directory structure

```text
backend/
  cmd/
    server/          ← entry point: configuration and wiring only
  internal/
    domain/          ← entities and value objects; no dependencies on other layers
    usecase/         ← business logic; defines interfaces for everything it depends on
    repository/      ← SQLite access; implements interfaces defined in usecase/
    memstore/        ← in-memory state: sessions, sign-in lockout, rate-limit counters
    api/             ← GENERATED from docs/openapi.yaml; never edited by hand
    handler/         ← HTTP delivery; implements the generated strict server interface
      middleware/    ← HTTP-specific middleware
    worker/          ← background loops: the check scheduler and the alert delivery loop
    adaptor/         ← talks to systems outside the app; satisfies interfaces defined by its consumer
      probe/         ← runs one HTTP(S) or TCP check attempt
      mailer/        ← sends email over SMTP
      webhook/       ← sends a webhook delivery
    web/             ← embeds and serves the built frontend (`dist/`)
    platform/        ← cross-cutting infrastructure, startup concerns only
      config/        ← environment parsing; the only reader of environment variables
      database/      ← opens the SQLite file
      migrate/       ← applies the embedded migrations at startup
    testutil/        ← shared test helpers (the test database, stub target server, fakes)
  pkg/               ← generic utilities with no app-specific knowledge (the clock)
  migration/         ← numbered SQL migration pairs, embedded in the binary
```

### Interfaces

Interfaces are defined by their consumer, in the consumer's package. The usecase layer defines every interface it depends on (repositories, the scheduler, the prober, the alert sender, the session store, the clock). Implementing packages satisfy them without importing `usecase/`.

- Inline in the usecase file if: at most 2 methods AND used only by that file.
- Separate file `<resource>_<dependency>.go` if: more than 2 methods OR shared across usecases.
- All interfaces are exported, whatever their placement.

Tests keep the same direction: a layer's tests never import a layer above it, and usecase tests never import `repository/` (see `TESTING.md`).

### Generated API types

`internal/api` is generated (`make generate`) and committed. It describes the wire format, not the domain.

- Only `handler/` imports `internal/api`. `usecase/`, `repository/`, `domain/`, `worker/` and `adaptor/` never do.
- Handlers map between `api` types and domain types. Never pass an `api` type into a usecase.

### Handlers and cross-cutting HTTP rules

`handler.Server` implements the generated strict server interface. Operations not implemented yet fall through to embedded `unimplemented` stubs (`stubs.go`) and answer 501. To implement one, define its method on `*Server` in a file named after its feature; it shadows the stub. Add a new dependency on `Server` as its own field line.

These are applied once, in a single policy router, and handlers never check them:

- the access rule for each operation (public or gated, from `security` in `docs/openapi.yaml`); a new operation is gated unless the contract marks it public;
- the CSRF token on gated operations that send data;
- the 1 MB request size limit and the JSON content type;
- the scheme and client address of the request, resolved from `TRUST_PROXY` and `CLIENT_IP_HEADER`. Nothing else reads forwarding headers.

Paths under `/api` and `/health` go to the API. Every other path is served by `web/`: a built file if one matches, otherwise the app page.

Errors: a handler returns a domain error and one `ErrorHandler` turns it into `application/problem+json`. When a usecase gains a sentinel error, add a row to the mapping table; its `code` must exist in `docs/openapi.yaml`.

### Background work

`worker/` is a delivery layer, like `handler/`: it owns timing, cancellation and retries, and calls a usecase for every decision.

- **Scheduler:** one goroutine and one cancellable context per service that is not paused. It runs a check sequence (attempt, wait, retry) at the service's interval and hands each result to a usecase. Cancelling the context stops the timer, a running attempt and a retry wait.
- **Rules live in `usecase/`:** what a result does to a service's status, whether a change sends alerts, what a test-before-save returns. `worker/` and `adaptor/` hold no such rules.
- **The usecase tells the scheduler.** After the database write for add, edit, pause, resume or delete has committed, the usecase calls the `Scheduler` interface it defines (start, restart, stop for one service). Never inside the transaction.
- **Startup rebuilds everything.** The scheduler is started from the saved services. No schedule, attempt count, pending alert or retry is stored.
- **Alert delivery loop:** takes alerts from the usecase, sends to each target independently through the alert sender, retries per target, and reports each final outcome to a usecase.
- **Time:** every timer, wait and timestamp goes through the clock in `pkg/`. No direct `time.Now`, `time.Sleep`, `time.After` or `time.NewTimer` outside `pkg/` and `cmd/`.

### In-memory state

`memstore/` holds sessions, failed sign-in counts, lockouts and rate-limit counters. Nothing in it is written to the database, and it starts empty. It implements interfaces defined by its consumers and takes the clock.

### Package placement

- **`internal/`**: default for all app code.
- **`internal/adaptor/`**: the only place that opens connections to systems outside the app (checked services, SMTP, webhooks). Adaptors hold no business rules.
- **`pkg/`**: zero app-specific knowledge; could be dropped into any Go project unchanged. Promotion is a deliberate decision, never speculative.
- **`handler/middleware/`**: HTTP middleware only.
- **`platform/config/`**: the only package that reads environment variables. Every key it reads is in `.env.example`.

Exception: `repository/` may contain ORM infrastructure files (a custom logger) next to repository implementations.

### Database migrations

Migrations live in `backend/migration/` as numbered SQL pairs, embedded in the binary and applied at startup before the server listens. A failed migration stops the app.

- **Numbering:** highest existing number + 1, zero-padded to 6 digits (`ls backend/migration | tail -1`). Only one agent adds migrations at a time (`ROLES.md`).
- **Every migration needs both files**, and the `.down.sql` must actually reverse the `.up.sql`.
- **Migrations and ORM structs change together.** There is no auto-migrate: the struct tags in `internal/domain/*.go` are the hand-kept mirror of the schema. A migration that adds, renames or drops a column updates the struct in the same change, with the `column:` tag matching exactly, and a new domain field needs a migration. Struct fields deliberately not mapped: none.
- **Additive steps only:** a migration adds; it does not drop or rename in the same release as the code that stops using the old shape. The previous release must still run on the new schema, so that a rollback works.
- `docs/data-model.md` and the migrations agree. A migration that changes the schema updates it in the same change.
