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

	"monitory/internal/adaptor/mailer"
	"monitory/internal/adaptor/probe"
	"monitory/internal/adaptor/webhook"
	"monitory/internal/domain"
	"monitory/internal/handler"
	"monitory/internal/memstore"
	"monitory/internal/platform/config"
	"monitory/internal/platform/database"
	"monitory/internal/platform/migrate"
	"monitory/internal/repository"
	"monitory/internal/usecase"
	"monitory/internal/web"
	"monitory/internal/worker"
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

// serviceLimits maps the configured limits to the ones saving a service applies.
func serviceLimits(l config.Limits) domain.ServiceLimits {
	toRange := func(r config.Range) domain.Range { return domain.Range{Default: r.Default, Min: r.Min, Max: r.Max} }
	return domain.ServiceLimits{
		CheckInterval:         toRange(l.CheckInterval),
		Timeout:               toRange(l.Timeout),
		RetryCount:            toRange(l.RetryCount),
		RetryInterval:         toRange(l.RetryInterval),
		ServiceNameMaxLength:  l.ServiceNameMaxLength,
		MaxServices:           l.MaxServices,
		MaxJSONRules:          l.MaxJSONRules,
		RequestURLMaxLength:   l.RequestURLMaxLength,
		RequestMaxQueryParams: l.RequestMaxQueryParams,
		RequestMaxHeaders:     l.RequestMaxHeaders,
		HeaderNameMaxLength:   l.HeaderNameMaxLength,
		HeaderValueMaxLength:  l.HeaderValueMaxLength,
		RequestBodyMaxBytes:   l.RequestBodyMaxBytes,
	}
}

func targetLimits(l config.Limits) domain.TargetLimits {
	return domain.TargetLimits{
		MaxTargets:           l.MaxTargetsPerService,
		EmailMaxLength:       l.EmailMaxLength,
		WebhookURLMaxLength:  l.WebhookURLMaxLength,
		MaxHeaders:           l.RequestMaxHeaders,
		HeaderNameMaxLength:  l.HeaderNameMaxLength,
		HeaderValueMaxLength: l.HeaderValueMaxLength,
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

	serviceRepo := repository.NewServiceRepository(db)
	targetRepo := repository.NewTargetRepository(db)

	mail, err := mailer.New(mailer.Config{
		Host:     cfg.SMTP.Host,
		Port:     cfg.SMTP.Port,
		TLS:      cfg.SMTP.TLS,
		Username: cfg.SMTP.Username,
		Password: cfg.SMTP.Password,
		From:     cfg.SMTP.From,
	})
	if err != nil {
		return err
	}
	sender, err := webhook.New(webhook.Config{
		Timeout: time.Duration(cfg.Limits.WebhookTimeoutSeconds) * time.Second,
	})
	if err != nil {
		return err
	}
	dispatcher := worker.NewAlertDispatcher(mail, sender, log)
	// Deferred after the database's, so it runs before the database is closed, and before
	// the scheduler's, so that the scheduler closes first (deferred calls run last in,
	// first out): no new result, then the attempts in flight are cancelled and waited for.
	defer dispatcher.Close()

	checkResults := usecase.NewCheckResultService(repository.NewServiceStateRepository(db), serviceRepo, targetRepo, dispatcher, clock.Real{})
	runner := worker.NewCheckRunner(probe.NewHTTPProber(cfg.Limits.MaxRedirects), checkResults, clock.Real{})
	scheduler := worker.NewScheduler(runner.Run, clock.Real{}, log)
	defer scheduler.Close()

	services := usecase.NewServiceService(serviceRepo, scheduler, clock.Real{}, serviceLimits(cfg.Limits))
	targets := usecase.NewTargetService(targetRepo, clock.Real{}, targetLimits(cfg.Limits))
	sessions := memstore.NewSessions(clock.Real{})
	auth := usecase.NewAuthService(cfg.AdminUsername, cfg.AdminPassword, cfg.RequireHTTPS, sessions, clock.Real{})
	e, err := handler.NewRouter(handler.Deps{
		Server:          handler.NewServer(settings, services, targets, auth, log, cfg.RequireHTTPS),
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

	if err := services.StartChecks(context.Background()); err != nil {
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

	// No sequence writes while requests drain; then the deliveries in flight are
	// cancelled and waited for. Both closes are safe a second time (the deferred ones).
	scheduler.Close()
	dispatcher.Close()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := e.Shutdown(shutdownCtx); err != nil {
		return err
	}
	log.Info("stopped")
	return nil
}
