package usecase

import (
	"context"

	"monitory/internal/domain"
)

// TargetService reads and changes the notification targets on a service's alert list.
type TargetService struct {
	targets TargetRepository
	clock   Clock
	limits  domain.TargetLimits
}

// NewTargetService returns a TargetService.
func NewTargetService(targets TargetRepository, clock Clock, limits domain.TargetLimits) *TargetService {
	return &TargetService{targets: targets, clock: clock, limits: limits}
}

// ListTargets returns the service's targets in the order the repository gives (FR-17).
func (s *TargetService) ListTargets(ctx context.Context, serviceID string) ([]domain.Target, error) {
	return s.targets.List(ctx, serviceID)
}

// CreateTarget validates the input and adds the target to the service's alert list
// (FR-14). Nothing is saved when the input is rejected.
func (s *TargetService) CreateTarget(ctx context.Context, serviceID string, input domain.TargetInput) (domain.Target, error) {
	if fields := ValidateTargetInput(input, s.limits); len(fields) > 0 {
		return domain.Target{}, domain.ValidationError{Fields: fields}
	}
	id, err := domain.NewID()
	if err != nil {
		return domain.Target{}, err
	}
	now := s.clock.Now().UTC()
	target := buildTarget(id, serviceID, normalizeTargetInput(input))
	target.CreatedAt, target.UpdatedAt = now, now
	if err := s.targets.Create(ctx, target, s.limits.MaxTargets); err != nil {
		return domain.Target{}, err
	}
	return target, nil
}

// UpdateTarget validates the input and replaces the target's editable fields (FR-15).
// It returns the row as stored.
func (s *TargetService) UpdateTarget(ctx context.Context, serviceID, targetID string, input domain.TargetInput) (domain.Target, error) {
	if fields := ValidateTargetInput(input, s.limits); len(fields) > 0 {
		return domain.Target{}, domain.ValidationError{Fields: fields}
	}
	target := buildTarget(targetID, serviceID, normalizeTargetInput(input))
	target.UpdatedAt = s.clock.Now().UTC()
	return s.targets.Update(ctx, target)
}

// DeleteTarget removes the target from the service's alert list (FR-16).
func (s *TargetService) DeleteTarget(ctx context.Context, serviceID, targetID string) error {
	return s.targets.Delete(ctx, serviceID, targetID)
}

// buildTarget makes the row from validated, normalized input. Only the part that matches
// the type is kept; the headers of an email are empty, never nil.
func buildTarget(id, serviceID string, in domain.TargetInput) domain.Target {
	target := domain.Target{
		ID:        id,
		ServiceID: serviceID,
		Name:      in.Name,
		Type:      domain.TargetType(in.Type),
		Headers:   []domain.NameValue{},
	}
	switch target.Type {
	case domain.TargetTypeEmail:
		target.Value = in.Address
	case domain.TargetTypeWebhook:
		target.Value = in.URL
		target.Headers = append(target.Headers, in.Headers...)
	}
	target.ValueKey = domain.TargetValueKey(target.Type, target.Value)
	return target
}
