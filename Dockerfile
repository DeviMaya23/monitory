# One image: the Go binary with the built frontend embedded (deploy/README.md).
#
# Build, from the repository root:
#   docker build -t monitory .
# Run, with the data on a volume:
#   docker run --rm -p 8080:8080 -v monitory-data:/data --env-file <env file> monitory
# `docker --env-file` does not strip quotes: write the values without them.

# Stage 1: build the frontend into backend/internal/web/dist.
FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: build the Go binary, which embeds the frontend from stage 1.
FROM golang:1.27-alpine AS backend
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
COPY --from=frontend /src/backend/internal/web/dist/ ./internal/web/dist/
# Fails the build if the frontend stage produced no app page: the binary would
# otherwise ship with the placeholder.
RUN test -f internal/web/dist/index.html
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server
# The volume mount point, owned by the user the app runs as.
RUN mkdir -p /out/data

# Stage 3: the runtime image. No shell, no package manager, not root.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=backend /out/server /app/server
COPY --from=backend --chown=65532:65532 /out/data /data
USER 65532:65532
ENV LISTEN_ADDR=:8080 \
    DATABASE_PATH=/data/monitory.db
EXPOSE 8080
VOLUME /data
ENTRYPOINT ["/app/server"]
