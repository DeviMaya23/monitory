package worker

import (
	"context"
	"errors"
	"time"

	"monitory/internal/domain"
	"monitory/pkg/clock"
)

// Prober makes one HTTP check attempt. It returns an error only when ctx ends.
type Prober interface {
	CheckHTTP(ctx context.Context, check domain.HTTPCheck) (domain.CheckResult, error)
}

// CheckRecorder saves the final result of a check sequence.
type CheckRecorder interface {
	RecordCheckResult(ctx context.Context, serviceID string, result domain.CheckResult) error
}

// CheckRunner runs check sequences. It keeps no per-sequence state, so one runner
// serves any number of concurrent sequences.
type CheckRunner struct {
	prober   Prober
	recorder CheckRecorder
	clock    clock.Clock
}

// NewCheckRunner returns a CheckRunner.
func NewCheckRunner(prober Prober, recorder CheckRecorder, clock clock.Clock) *CheckRunner {
	return &CheckRunner{prober: prober, recorder: recorder, clock: clock}
}

var errMissingHTTPSettings = errors.New("check runner: http service has no method or url")

// Run makes one check sequence for service: an attempt, then up to RetryCount more,
// each after a wait of RetryIntervalSeconds, stopping at the first healthy result
// (FR-51, FR-53, FR-54). The last attempt's result is recorded. When ctx ends during an
// attempt or a wait, or before the record, Run returns the context's error and records
// nothing (FR-71). A TCP service is skipped: there is no TCP probe yet.
func (r *CheckRunner) Run(ctx context.Context, service domain.Service) error {
	if service.CheckType != domain.CheckTypeHTTP {
		return nil
	}
	if service.HTTPMethod == nil || service.HTTPURL == nil {
		return errMissingHTTPSettings
	}
	check := domain.HTTPCheck{
		Method:  *service.HTTPMethod,
		URL:     *service.HTTPURL,
		Timeout: time.Duration(service.TimeoutSeconds) * time.Second,

		QueryParams: service.HTTPQueryParams,
		Headers:     service.HTTPHeaders,
		BodyType:    service.HTTPBodyType,
		BodyContent: service.HTTPBodyContent,
	}
	wait := time.Duration(service.RetryIntervalSeconds) * time.Second
	retries := max(service.RetryCount, 0)

	var result domain.CheckResult
	for attempt := 0; attempt <= retries; attempt++ {
		if attempt > 0 {
			if err := r.wait(ctx, wait); err != nil {
				return err
			}
		}
		var err error
		result, err = r.prober.CheckHTTP(ctx, check)
		if err != nil {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return ctxErr
			}
			return err
		}
		if result.Healthy {
			break
		}
	}

	if err := ctx.Err(); err != nil {
		return err
	}
	return r.recorder.RecordCheckResult(ctx, service.ID, result)
}

// wait blocks for d on the clock's timer. The context wins when it has ended, even if
// the timer has fired too. The timer is stopped on every exit.
func (r *CheckRunner) wait(ctx context.Context, d time.Duration) error {
	timer := r.clock.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
	case <-timer.C():
	}
	return ctx.Err()
}
