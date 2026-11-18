package usecase

import (
	"context"
	"errors"
	"fmt"

	"monitory/internal/domain"
)

// DeliveryFlagWriter writes the "last delivery failed" mark of a target.
// repository.TargetRepository satisfies it.
type DeliveryFlagWriter interface {
	// SetDeliveryFailed returns domain.ErrNotFound when the target is not in the service.
	SetDeliveryFailed(ctx context.Context, serviceID, targetID string, failed bool) error
}

// DeliveryOutcomeService records the final outcome of an alert delivery to a target
// (FR-86). It touches the target's mark and nothing else, so a failed delivery never
// changes the status of the service (FR-84).
type DeliveryOutcomeService struct {
	targets DeliveryFlagWriter
}

// NewDeliveryOutcomeService returns a DeliveryOutcomeService.
func NewDeliveryOutcomeService(targets DeliveryFlagWriter) *DeliveryOutcomeService {
	return &DeliveryOutcomeService{targets: targets}
}

// RecordDeliveryOutcome sets the target's mark after a final failure and clears it after
// a delivery (FR-86). A target or service deleted since the alert was handed off is not
// an error: there is nothing to mark.
func (s *DeliveryOutcomeService) RecordDeliveryOutcome(ctx context.Context, serviceID, targetID string, delivered bool) error {
	err := s.targets.SetDeliveryFailed(ctx, serviceID, targetID, !delivered)
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("record delivery outcome: %w", err)
	}
	return nil
}
