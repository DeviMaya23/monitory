package usecase

import (
	"context"

	"monitory/internal/domain"
)

// TargetRepository stores the notification targets of each service's alert list.
type TargetRepository interface {
	// List returns the service's targets ordered by when they were added, then id. It
	// returns domain.ErrNotFound when there is no such service, and an empty list for
	// a service with no targets.
	List(ctx context.Context, serviceID string) ([]domain.Target, error)
	// Create saves the target in one write transaction: the service must exist
	// (domain.ErrNotFound); at maxTargets targets or more it returns
	// domain.ErrAlertListFull; the same contact twice is domain.ErrTargetDuplicate
	// (FR-19, FR-88).
	Create(ctx context.Context, target domain.Target, maxTargets int) error
	// Update replaces the editable fields of the service's target and returns the row
	// as stored. A target that does not exist, or belongs to another service, is
	// domain.ErrNotFound; a contact already in the list is domain.ErrTargetDuplicate.
	Update(ctx context.Context, target domain.Target) (domain.Target, error)
	// Delete removes the service's target; none is domain.ErrNotFound.
	Delete(ctx context.Context, serviceID, targetID string) error
}
