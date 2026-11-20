package usecase

import (
	"context"
	"errors"
	"fmt"
	"time"

	"monitory/internal/domain"
)

// ServiceStateRepository updates a service's saved state. Update reads the row, passes
// it to apply and writes what apply returns, as one operation; it returns
// domain.ErrNotFound when the service has no row, and domain.ErrServicePaused, without
// calling apply or writing, when the service is paused (FR-76).
type ServiceStateRepository interface {
	Update(ctx context.Context, serviceID string, apply func(domain.ServiceState) domain.ServiceState) error
}

// serviceFinder reads one service as saved.
type serviceFinder interface {
	Find(ctx context.Context, id string) (domain.Service, error)
}

// targetLister lists a service's alert list.
type targetLister interface {
	List(ctx context.Context, serviceID string) ([]domain.Target, error)
}

// alertDispatcher takes an alert to deliver to targets. It returns at once.
type alertDispatcher interface {
	Dispatch(alert domain.Alert, targets []domain.Target)
}

// CheckResultService turns the result of a check sequence into the service's state and
// decides whether the change is alerted.
type CheckResultService struct {
	states     ServiceStateRepository
	services   serviceFinder
	targets    targetLister
	dispatcher alertDispatcher
	clock      Clock
}

// NewCheckResultService returns a CheckResultService.
func NewCheckResultService(states ServiceStateRepository, services serviceFinder, targets targetLister, dispatcher alertDispatcher, clock Clock) *CheckResultService {
	return &CheckResultService{states: states, services: services, targets: targets, dispatcher: dispatcher, clock: clock}
}

var errInconsistentResult = errors.New("check result: healthy must have no failure and unhealthy must have one")

// RecordCheckResult saves result as the state of the service (FR-54, FR-55, FR-61) and,
// when the status changed and the service's alerts are on, hands one alert to delivery
// for every target on its list (FR-21, FR-22, FR-24, FR-25). A result for a service that
// no longer exists is dropped and changes nothing (FR-70).
func (s *CheckResultService) RecordCheckResult(ctx context.Context, serviceID string, result domain.CheckResult) error {
	if result.Healthy == (result.Failure != nil) {
		return errInconsistentResult
	}
	now := s.clock.Now().UTC()
	var previous domain.Status
	err := s.states.Update(ctx, serviceID, func(saved domain.ServiceState) domain.ServiceState {
		previous = saved.Status
		return applyCheckResult(saved, result, now)
	})
	// A result for a deleted service, or one that finished in the instant of a pause, is
	// dropped: no state change and no alert (FR-76).
	if errors.Is(err, domain.ErrNotFound) || errors.Is(err, domain.ErrServicePaused) {
		return nil
	}
	if err != nil {
		return err
	}

	status, due := alertFor(previous, result.Healthy)
	if !due {
		return nil
	}

	// The state is committed. The reads below must not be dropped because the sequence
	// was cancelled after the save (an edit, a pause or a delete), so they do not
	// follow its cancellation.
	readCtx := context.WithoutCancel(ctx)
	service, err := s.services.Find(readCtx, serviceID)
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read service for alert: %w", err)
	}
	if !service.AlertsEnabled {
		return nil
	}
	targets, err := s.targets.List(readCtx, serviceID)
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("list targets for alert: %w", err)
	}
	if len(targets) == 0 {
		return nil
	}
	s.dispatcher.Dispatch(buildAlert(service, status, now), targets)
	return nil
}

// alertFor is the change rule: the alert status a move from previous to the new status
// calls for, if any. A first healthy check, a healthy service that stays healthy and an
// unhealthy one that stays unhealthy alert nobody (FR-24, FR-25, FR-111).
func alertFor(previous domain.Status, healthy bool) (domain.AlertStatus, bool) {
	switch {
	case !healthy && previous != domain.StatusUnhealthy:
		return domain.AlertUnhealthy, true
	case healthy && previous == domain.StatusUnhealthy:
		return domain.AlertHealthy, true
	}
	return "", false
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
