// Package handler is the HTTP delivery layer: it implements the generated strict
// server interface, maps between api types and domain types, and applies the
// cross-cutting HTTP rules once, in the policy router.
package handler

import (
	"context"

	"monitory/internal/api"
)

// SettingsService is what the settings handlers need from the usecase layer.
type SettingsService interface {
	PublicViewEnabled(ctx context.Context) (bool, error)
	SetPublicViewEnabled(ctx context.Context, enabled bool) error
}

// Server implements the generated strict server interface, one method per operation in
// docs/openapi.yaml. Operations without an implementation fall through to the embedded
// `unimplemented` and answer 501.
//
// To implement an operation, define its method on *Server in a file named after its
// feature (services.go, targets.go, ...). A method on Server shadows the promoted stub
// of the same name, so stubs.go needs no edit. Add a new dependency as its own field
// line and its own NewServer argument.
type Server struct {
	unimplemented

	settings SettingsService
}

// NewServer builds the Server from its dependencies.
func NewServer(settings SettingsService) *Server {
	return &Server{settings: settings}
}

// The compiler checks that Server covers every operation in the contract.
var _ api.StrictServerInterface = (*Server)(nil)
