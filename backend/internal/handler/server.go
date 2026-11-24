// Package handler is the HTTP delivery layer: it implements the generated strict
// server interface, maps between api types and domain types, and applies the
// cross-cutting HTTP rules once, in the policy router.
package handler

import (
	"context"
	"log/slog"

	"monitory/internal/api"
	"monitory/internal/domain"
)

// SettingsService is what the settings handlers need from the usecase layer.
type SettingsService interface {
	PublicViewEnabled(ctx context.Context) (bool, error)
	SetPublicViewEnabled(ctx context.Context, enabled bool) error
}

// ServiceService is what the service handlers need from the usecase layer.
type ServiceService interface {
	CreateService(ctx context.Context, input domain.ServiceInput) (domain.ServiceView, error)
	ListServices(ctx context.Context) ([]domain.ServiceView, error)
	GetService(ctx context.Context, id string) (domain.ServiceView, error)
	UpdateService(ctx context.Context, id string, input domain.ServiceInput) (domain.ServiceView, error)
	DeleteService(ctx context.Context, id string) error
	PauseService(ctx context.Context, id string) (domain.ServiceView, error)
	ResumeService(ctx context.Context, id string) (domain.ServiceView, error)
}

// TargetService is what the target handlers need from the usecase layer.
type TargetService interface {
	ListTargets(ctx context.Context, serviceID string) ([]domain.Target, error)
	CreateTarget(ctx context.Context, serviceID string, input domain.TargetInput) (domain.Target, error)
	UpdateTarget(ctx context.Context, serviceID, targetID string, input domain.TargetInput) (domain.Target, error)
	DeleteTarget(ctx context.Context, serviceID, targetID string) error
}

// TargetTester is what the target test handler needs from the usecase layer.
type TargetTester interface {
	TestTarget(ctx context.Context, serviceID string, input domain.TargetInput) (domain.TargetTestResult, error)
}

// ServiceCheckTester is what the service test handler needs from the usecase layer.
type ServiceCheckTester interface {
	TestServiceCheck(ctx context.Context, input domain.ServiceTestInput) (domain.ServiceTestResult, error)
}

// AuthService is what the session handlers need from the usecase layer.
type AuthService interface {
	SignIn(ctx context.Context, username, password string, https bool) (domain.Session, error)
	SignOut(ctx context.Context, token string) error
}

// PublicViewService is what the public dashboard handler needs from the usecase layer.
type PublicViewService interface {
	PublicDashboard(ctx context.Context, clientAddr string) ([]domain.PublicService, error)
}

// Server implements the generated strict server interface, one method per operation in
// docs/openapi.yaml. Define each operation's method on *Server in a file named after
// its feature (services.go, targets.go, ...). Add a new dependency as its own field
// line and its own NewServer argument.
type Server struct {
	settings SettingsService
	services ServiceService
	targets  TargetService
	tester   TargetTester
	checks   ServiceCheckTester
	auth     AuthService
	public   PublicViewService
	log      *slog.Logger
	// secureCookie is whether the session cookie carries Secure: it follows the
	// "require HTTPS" setting, not the scheme of the request (FR-98).
	secureCookie bool
}

// NewServer builds the Server from its dependencies.
func NewServer(settings SettingsService, services ServiceService, targets TargetService, tester TargetTester, checks ServiceCheckTester, auth AuthService, public PublicViewService, log *slog.Logger, secureCookie bool) *Server {
	return &Server{settings: settings, services: services, targets: targets, tester: tester, checks: checks, auth: auth, public: public, log: log, secureCookie: secureCookie}
}

// The compiler checks that Server covers every operation in the contract.
var _ api.StrictServerInterface = (*Server)(nil)
