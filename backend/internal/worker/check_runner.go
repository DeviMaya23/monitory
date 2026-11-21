package worker

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"monitory/internal/domain"
	"monitory/pkg/clock"
)

// Prober makes one HTTP check attempt. It returns an error only when ctx ends.
type Prober interface {
	CheckHTTP(ctx context.Context, check domain.HTTPCheck) (domain.CheckResult, error)
}

// TCPProber makes one TCP check attempt. It returns an error only when ctx ends.
type TCPProber interface {
	CheckTCP(ctx context.Context, check domain.TCPCheck) (domain.CheckResult, error)
}

// CheckRecorder saves the final result of a check sequence.
type CheckRecorder interface {
	RecordCheckResult(ctx context.Context, serviceID string, result domain.CheckResult) error
}

// CheckRunner runs check sequences. It keeps no per-sequence state, so one runner
// serves any number of concurrent sequences.
type CheckRunner struct {
	prober    Prober
	tcpProber TCPProber
	recorder  CheckRecorder
	clock     clock.Clock
	log       *slog.Logger
}

// NewCheckRunner returns a CheckRunner.
func NewCheckRunner(prober Prober, tcpProber TCPProber, recorder CheckRecorder, clock clock.Clock, log *slog.Logger) *CheckRunner {
	return &CheckRunner{prober: prober, tcpProber: tcpProber, recorder: recorder, clock: clock, log: log}
}

var (
	errMissingHTTPSettings = errors.New("check runner: http service has no method or url")
	errMissingTCPSettings  = errors.New("check runner: tcp service has no host or port")
	errUnknownCheckType    = errors.New("check runner: unknown check type")
)

// Run makes one check sequence for service: an attempt, then up to RetryCount more,
// each after a wait of RetryIntervalSeconds, stopping at the first healthy result
// (FR-51, FR-52, FR-53, FR-54). The service's type decides only how one attempt is
// made. The last attempt's result is recorded and logged once. When ctx ends during an
// attempt or a wait, or before the record, Run returns the context's error and records
// nothing (FR-71).
func (r *CheckRunner) Run(ctx context.Context, service domain.Service) error {
	attempt, err := r.attemptFunc(service)
	if err != nil {
		return err
	}
	wait := time.Duration(service.RetryIntervalSeconds) * time.Second
	retries := max(service.RetryCount, 0)

	var result domain.CheckResult
	for n := 0; n <= retries; n++ {
		if n > 0 {
			if err := r.wait(ctx, wait); err != nil {
				return err
			}
		}
		var err error
		result, err = attempt(ctx)
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
	if err := r.recorder.RecordCheckResult(ctx, service.ID, result); err != nil {
		return err
	}
	r.logFinished(ctx, service, result)
	return nil
}

// attemptFunc returns the function that makes one attempt for service, built from the
// saved fields of its type.
func (r *CheckRunner) attemptFunc(service domain.Service) (func(context.Context) (domain.CheckResult, error), error) {
	switch service.CheckType {
	case domain.CheckTypeHTTP:
		if service.HTTPMethod == nil || service.HTTPURL == nil {
			return nil, errMissingHTTPSettings
		}
		check := domain.HTTPCheck{
			Method:  *service.HTTPMethod,
			URL:     *service.HTTPURL,
			Timeout: time.Duration(service.TimeoutSeconds) * time.Second,

			QueryParams: service.HTTPQueryParams,
			Headers:     service.HTTPHeaders,
			BodyType:    service.HTTPBodyType,
			BodyContent: service.HTTPBodyContent,

			JSONRules:    service.JSONRules,
			JSONRuleMode: service.JSONRuleMode,

			CertificateCheck:        service.CertCheck,
			IgnoreCertificateErrors: service.IgnoreCertErrs,
		}
		if service.CertCheck && service.CertMinDaysLeft != nil {
			check.CertMinDaysLeft = *service.CertMinDaysLeft
		}
		return func(ctx context.Context) (domain.CheckResult, error) {
			return r.prober.CheckHTTP(ctx, check)
		}, nil
	case domain.CheckTypeTCP:
		if service.TCPHost == nil || *service.TCPHost == "" || service.TCPPort == nil {
			return nil, errMissingTCPSettings
		}
		check := domain.TCPCheck{
			Host:    *service.TCPHost,
			Port:    *service.TCPPort,
			Timeout: time.Duration(service.TimeoutSeconds) * time.Second,
		}
		return func(ctx context.Context) (domain.CheckResult, error) {
			return r.tcpProber.CheckTCP(ctx, check)
		}, nil
	default:
		return nil, errUnknownCheckType
	}
}

// logFinished writes the one line for a recorded sequence: no address, URL, header,
// query, body or rule (CONVENTIONS.md, Logging).
func (r *CheckRunner) logFinished(ctx context.Context, service domain.Service, result domain.CheckResult) {
	attrs := []slog.Attr{
		slog.String("service_id", service.ID),
		slog.String("service_name", service.Name),
		slog.Bool("healthy", result.Healthy),
	}
	if result.Healthy {
		r.log.LogAttrs(ctx, slog.LevelInfo, "check finished", attrs...)
		return
	}
	if f := result.Failure; f != nil {
		attrs = append(attrs, slog.String("failure_code", string(f.Code)))
		if f.Code == domain.FailureNon2xxStatus && f.HTTPStatus != nil {
			attrs = append(attrs, slog.Int("http_status", *f.HTTPStatus))
		}
	}
	r.log.LogAttrs(ctx, slog.LevelWarn, "check finished", attrs...)
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
