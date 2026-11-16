package usecase

import (
	"context"
	"errors"
	"time"

	"monitory/internal/domain"
)

// ServiceStateRepository updates a service's saved state. Update reads the row, passes
// it to apply and writes what apply returns, as one operation; it returns
// domain.ErrNotFound when the service has no row.
type ServiceStateRepository interface {
	Update(ctx context.Context, serviceID string, apply func(domain.ServiceState) domain.ServiceState) error
}

// CheckResultService turns the result of a check sequence into the service's state.
type CheckResultService struct {
	states ServiceStateRepository
	clock  Clock
}

// NewCheckResultService returns a CheckResultService.
func NewCheckResultService(states ServiceStateRepository, clock Clock) *CheckResultService {
	return &CheckResultService{states: states, clock: clock}
}

var errInconsistentResult = errors.New("check result: healthy must have no failure and unhealthy must have one")

// RecordCheckResult saves result as the state of the service (FR-54, FR-55, FR-61). A
// result for a service that no longer exists is dropped and changes nothing (FR-70).
func (s *CheckResultService) RecordCheckResult(ctx context.Context, serviceID string, result domain.CheckResult) error {
	if result.Healthy == (result.Failure != nil) {
		return errInconsistentResult
	}
	now := s.clock.Now().UTC()
	err := s.states.Update(ctx, serviceID, func(saved domain.ServiceState) domain.ServiceState {
		return applyCheckResult(saved, result, now)
	})
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	return err
}

// applyCheckResult is the status rule: the state that follows saved once result came in
// at now. The change time moves only when the status changes; the failure columns are
// set only for an unhealthy result.
func applyCheckResult(saved domain.ServiceState, result domain.CheckResult, now time.Time) domain.ServiceState {
	next := saved
	next.LastCheckedAt = &now
	next.FailureCode, next.FailureHTTPStatus, next.FailureJSONRuleField = nil, nil, nil

	status := domain.StatusHealthy
	if !result.Healthy {
		status = domain.StatusUnhealthy
		code := result.Failure.Code
		next.FailureCode = &code
		if code == domain.FailureNon2xxStatus {
			next.FailureHTTPStatus = result.Failure.HTTPStatus
		}
		if code == domain.FailureJSONRuleMatched {
			next.FailureJSONRuleField = result.Failure.JSONRuleField
		}
	}
	next.Status = status
	if saved.Status != status {
		next.LastStatusChangeAt = &now
	}
	return next
}
