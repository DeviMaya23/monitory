package usecase

import (
	"context"

	"monitory/internal/domain"
)

// ServiceRepository stores services and their state.
type ServiceRepository interface {
	// Create saves the service and its state row (status not_yet_checked) in one
	// transaction. It returns domain.ErrServiceLimitReached when maxServices services
	// exist already, and domain.ErrServiceNameTaken when the name is used (FR-59, FR-60).
	Create(ctx context.Context, service domain.Service, maxServices int) error
	// List returns every service with its state, ordered by name ignoring case, then id.
	List(ctx context.Context) ([]domain.ServiceView, error)
	// Delete removes the service with its state and targets. It returns
	// domain.ErrNotFound when there is no such service (FR-70).
	Delete(ctx context.Context, id string) error
}
