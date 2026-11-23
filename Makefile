.DEFAULT_GOAL := help

# Load .env (if present) and pass its values to every command below.
-include .env
export

# Tools run through npx, pinned exactly, so they stay out of the dependency tree.
REDOCLY      := npx --yes @redocly/cli@2.78.0
OPENAPI_TS   := npx --yes openapi-typescript@7.13.0
MARKDOWNLINT := npx --yes markdownlint-cli2@0.24.1

CONTRACT := docs/openapi.yaml

.PHONY: help generate generate-check lint lint-backend lint-frontend lint-css lint-shell lint-md \
	openapi-lint test test-backend test-frontend test-integration test-e2e-smoke test-e2e \
	build build-backend build-frontend mailpit-up mailpit-down be-dev fe-dev docker-build check

help: ## List targets
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-18s %s\n", $$1, $$2}'

# --default-non-nullable=false: a field with a default stays optional in the TypeScript
# types, as the contract says; the server may leave it out.
generate: ## Regenerate Go and TypeScript code from docs/openapi.yaml
	cd backend && go generate ./internal/api
	cd frontend && $(OPENAPI_TS) ../$(CONTRACT) --default-non-nullable=false -o src/lib/api/schema.d.ts

# For CI: fails if regenerating changes the committed generated files.
generate-check: generate ## Fail if generated code is stale
	git diff --exit-code -- backend/internal/api frontend/src/lib/api

lint: lint-backend lint-frontend lint-css lint-shell ## Every linter except the contract's and markdown (run `make lint-md` by hand)

lint-backend: ## gofmt check and golangci-lint, including the integration-tagged files
	@test -z "$$(gofmt -l backend)" || (echo "gofmt needed on:"; gofmt -l backend; exit 1)
	cd backend && golangci-lint run --build-tags integration ./...

lint-frontend: ## ESLint
	cd frontend && npm run lint

lint-css: ## Stylelint over frontend/src/**/*.css
	cd frontend && npm run lint:css

lint-shell: ## shellcheck over scripts/
	@command -v shellcheck >/dev/null || (echo "shellcheck is not installed (macOS: brew install shellcheck)"; exit 1)
	shellcheck scripts/*.sh

lint-md: ## markdownlint over every markdown file (.markdownlint-cli2.yaml)
	$(MARKDOWNLINT)

openapi-lint: ## Lint docs/openapi.yaml
	$(REDOCLY) lint $(CONTRACT)

test: test-backend test-frontend ## Unit and repository tests (no Docker needed)

test-backend: ## Go tests with the race detector (integration tests are excluded by build tag)
	cd backend && go test -race ./...

test-frontend: ## Vitest
	cd frontend && npm test

mailpit-up: ## Start Mailpit (Docker): SMTP on 1025, web UI on http://localhost:8025
	docker compose up -d --wait mailpit

mailpit-down: ## Stop Mailpit
	docker compose down

test-integration: mailpit-up ## Go tests tagged integration (needs Docker for Mailpit)
	cd backend && go test -race -tags integration ./...

test-e2e-smoke: mailpit-up build ## Playwright smoke subset in Chromium (needs Docker)
	cd e2e && npx playwright test --project=chromium --grep @smoke

test-e2e: mailpit-up build ## Full Playwright suite in three browsers. The user runs this
	cd e2e && npx playwright test

build: build-frontend build-backend ## Build the frontend, then the backend that embeds it

build-backend: ## go build
	cd backend && go build ./...

build-frontend: ## Typecheck and Vite build into backend/internal/web/dist
	cd frontend && npm run build

be-dev: ## Run the Go server on LISTEN_ADDR from .env (default :8080)
	cd backend && go run ./cmd/server

fe-dev: ## Run the Vite dev server on FRONTEND_DEV_PORT (default 5173); it proxies /api and /health to LISTEN_ADDR's port
	cd frontend && npm run dev

docker-build: ## Build the production image as monitory:local
	docker build -t monitory:local .

# The definition of done: what an agent runs before pushing.
# Integration and end-to-end tests are not part of this.
check: lint openapi-lint test build ## lint + openapi-lint + test + build
