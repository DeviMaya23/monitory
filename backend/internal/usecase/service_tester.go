package usecase

import (
	"context"
	"fmt"
	"time"
	"unicode/utf8"

	"monitory/internal/domain"
)

// HTTPTestProber makes one HTTP(S) attempt and returns the verdict with the status and
// body of the response. Its only error is the caller's context error.
type HTTPTestProber interface {
	TestHTTP(ctx context.Context, check domain.HTTPCheck) (domain.HTTPTestOutcome, error)
}

// TCPTestProber makes one TCP attempt. Its only error is the caller's context error.
type TCPTestProber interface {
	CheckTCP(ctx context.Context, check domain.TCPCheck) (domain.CheckResult, error)
}

// ServiceCheckTestService tests a check that is not saved (FR-104). It is given two
// probers, a clock and the limits, and no repository, recorder, dispatcher or
// scheduler: it cannot save, change or send anything (FR-105).
type ServiceCheckTestService struct {
	http   HTTPTestProber
	tcp    TCPTestProber
	clock  Clock
	limits domain.ServiceLimits
}

// NewServiceCheckTestService returns a ServiceCheckTestService.
func NewServiceCheckTestService(http HTTPTestProber, tcp TCPTestProber, clock Clock, limits domain.ServiceLimits) *ServiceCheckTestService {
	return &ServiceCheckTestService{http: http, tcp: tcp, clock: clock, limits: limits}
}

// TestServiceCheck validates the check and the timeout as a save does, then makes one
// attempt, with no retry. A failed attempt is a result, not an error. An error is
// returned for invalid input (domain.ValidationError, before anything runs), an ended
// context, or an unexpected error of a probe.
func (s *ServiceCheckTestService) TestServiceCheck(ctx context.Context, input domain.ServiceTestInput) (domain.ServiceTestResult, error) {
	// The same trimming a save does, so the test sends what a save would store.
	in := normalizeServiceInput(domain.ServiceInput{Check: input.Check})
	check := in.Check

	timeout := s.limits.Timeout.Default
	if input.TimeoutSeconds != nil {
		timeout = *input.TimeoutSeconds
	}
	v := &fieldErrors{}
	validateCheck(v, check, s.limits)
	validateTimeout(v, timeout, s.limits.Timeout)
	if len(v.list) > 0 {
		return domain.ServiceTestResult{}, domain.ValidationError{Fields: v.list}
	}
	limit := time.Duration(timeout) * time.Second

	start := s.clock.Now()
	var result domain.ServiceTestResult
	var err error
	if domain.CheckType(check.Type) == domain.CheckTypeHTTP {
		result, err = s.testHTTP(ctx, buildHTTPCheck(check.HTTP, limit))
	} else {
		result, err = s.testTCP(ctx, domain.TCPCheck{Host: check.TCP.Host, Port: check.TCP.Port, Timeout: limit})
	}
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return domain.ServiceTestResult{}, ctxErr
		}
		// The text of an error is logged by the router: nothing of the check goes in it.
		return domain.ServiceTestResult{}, fmt.Errorf("run the check test: %w", err)
	}
	result.DurationMs = max(int(s.clock.Now().Sub(start).Milliseconds()), 0)
	return result, nil
}

func (s *ServiceCheckTestService) testHTTP(ctx context.Context, check domain.HTTPCheck) (domain.ServiceTestResult, error) {
	out, err := s.http.TestHTTP(ctx, check)
	if err != nil {
		return domain.ServiceTestResult{}, err
	}
	return domain.ServiceTestResult{
		Healthy:       out.Healthy,
		Failure:       out.Failure,
		HTTPStatus:    out.HTTPStatus,
		Body:          validUTF8(out.Body),
		BodyTruncated: out.BodyTruncated,
	}, nil
}

func (s *ServiceCheckTestService) testTCP(ctx context.Context, check domain.TCPCheck) (domain.ServiceTestResult, error) {
	res, err := s.tcp.CheckTCP(ctx, check)
	if err != nil {
		return domain.ServiceTestResult{}, err
	}
	return domain.ServiceTestResult{Healthy: res.Healthy, Failure: res.Failure}, nil
}

// buildHTTPCheck is the attempt a validated, trimmed HTTP check stands for.
func buildHTTPCheck(in domain.HTTPCheckInput, timeout time.Duration) domain.HTTPCheck {
	check := domain.HTTPCheck{
		Method:                  in.Method,
		URL:                     in.URL,
		Timeout:                 timeout,
		QueryParams:             in.QueryParams,
		Headers:                 in.Headers,
		BodyType:                domain.BodyType(in.BodyType),
		BodyContent:             in.BodyContent,
		JSONRules:               in.JSONRules,
		JSONRuleMode:            domain.JSONRuleMode(in.JSONRuleMode),
		CertificateCheck:        in.CertificateCheckEnabled,
		IgnoreCertificateErrors: in.IgnoreCertificateErrors,
	}
	if check.BodyType == "" {
		check.BodyType = domain.BodyTypeNone
	}
	if check.JSONRuleMode == "" {
		check.JSONRuleMode = domain.JSONRuleModeAny
	}
	if in.CertificateCheckEnabled && in.CertMinDaysLeft != nil {
		check.CertMinDaysLeft = *in.CertMinDaysLeft
	}
	return check
}

// validUTF8 returns s with each invalid byte replaced by U+FFFD, a character cut in
// half at the end of a truncated body included: the body is shown as text and sent as
// JSON.
func validUTF8(s string) string {
	if utf8.ValidString(s) {
		return s
	}
	return string([]rune(s))
}
