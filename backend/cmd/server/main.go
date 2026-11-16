// Command server is the app: it reads the configuration, opens the database, applies
// the migrations and serves the API and the frontend. Configuration and wiring only.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"monitory/internal/handler"
	"monitory/internal/memstore"
	"monitory/internal/platform/config"
	"monitory/internal/platform/database"
	"monitory/internal/platform/migrate"
	"monitory/internal/repository"
	"monitory/internal/usecase"
	"monitory/internal/web"
	"monitory/migration"
	"monitory/pkg/clock"
)

// shutdownTimeout is how long in-flight requests get to finish at a stop.
const shutdownTimeout = 10 * time.Second

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(log); err != nil {
		log.Error("the app stopped", "error", err.Error())
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	db, err := database.Open(cfg.DatabasePath)
	if err != nil {
		return err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	defer func() { _ = sqlDB.Close() }()

	// A failed migration stops the app before it listens.
	if err := migrate.Up(sqlDB, migration.Files); err != nil {
		return err
	}
	schemaVersion, err := migrate.Version(sqlDB)
	if err != nil {
		return err
	}

	frontend, err := web.Handler()
	if err != nil {
		return err
	}

	settings := usecase.NewSettingsService(repository.NewSettingsRepository(db), clock.Real{})

	sessions := memstore.NewSessions(clock.Real{})
	auth := usecase.NewAuthService(cfg.AdminUsername, cfg.AdminPassword, cfg.RequireHTTPS, sessions, clock.Real{})
	e, err := handler.NewRouter(handler.Deps{
		Server:          handler.NewServer(settings, auth, log, cfg.RequireHTTPS),
		Sessions:        sessions,
		Log:             log,
		MaxRequestBytes: cfg.Limits.APIRequestMaxBytes,
		TrustProxy:      cfg.TrustProxy,
		ClientIPHeader:  cfg.ClientIPHeader,
		Web:             frontend,
	})
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	serverErr := make(chan error, 1)
	go func() {
		if err := e.Start(cfg.ListenAddr); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	// Secrets and addresses are left out of the log (CONVENTIONS.md, Logging).
	log.Info("started",
		"listen_addr", cfg.ListenAddr,
		"schema_version", schemaVersion,
		"require_https", cfg.RequireHTTPS,
		"trust_proxy", cfg.TrustProxy,
		"smtp_configured", cfg.SMTP.Host != "",
	)

	select {
	case err := <-serverErr:
		return err
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := e.Shutdown(shutdownCtx); err != nil {
		return err
	}
	log.Info("stopped")
	return nil
}
