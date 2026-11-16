package usecase_test

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/usecase"
	"monitory/pkg/clock"
)

var (
	t0      = time.Date(2026, 3, 4, 5, 6, 7, 0, time.UTC)
	tNow    = time.Date(2026, 8, 9, 10, 11, 12, 0, time.UTC)
	svcID   = "svc-1"
	errBoom = errors.New("boom")
)

func ptrTo[T any](v T) *T { return &v }

func healthyResult() domain.CheckResult { return domain.CheckResult{Healthy: true} }

func failedResult(code domain.FailureCode, status *int, field *string) domain.CheckResult {
	return domain.CheckResult{Failure: &domain.CheckFailure{Code: code, HTTPStatus: status, JSONRuleField: field}}
}

func savedState(status domain.Status) domain.ServiceState {
	s := domain.ServiceState{ServiceID: svcID, Status: status}
	if status != domain.StatusNotYetChecked {
		s.LastCheckedAt, s.LastStatusChangeAt = ptrTo(t0), ptrTo(t0)
	}
	if status == domain.StatusUnhealthy {
		s.FailureCode = ptrTo(domain.FailureNon2xxStatus)
		s.FailureHTTPStatus = ptrTo(500)
	}
	return s
}

func record(t *testing.T, saved domain.ServiceState, result domain.CheckResult) domain.ServiceState {
	t.Helper()
	states := newFakeStates(saved)
	svc := usecase.NewCheckResultService(states, clock.NewFake(tNow))
	require.NoError(t, svc.RecordCheckResult(t.Context(), svcID, result))
	return states.states[svcID]
}

func TestRecordCheckResult_Rule(t *testing.T) {
	tests := []struct {
		name       string
		saved      domain.Status
		result     domain.CheckResult
		wantStatus domain.Status
		wantChange time.Time
		wantCode   *domain.FailureCode
		wantHTTP   *int
	}{
		{"first healthy", domain.StatusNotYetChecked, healthyResult(), domain.StatusHealthy, tNow, nil, nil},
		{"first failed", domain.StatusNotYetChecked, failedResult(domain.FailureTimedOut, nil, nil), domain.StatusUnhealthy, tNow, ptrTo(domain.FailureTimedOut), nil},
		{"healthy stays healthy", domain.StatusHealthy, healthyResult(), domain.StatusHealthy, t0, nil, nil},
		{"healthy becomes unhealthy", domain.StatusHealthy, failedResult(domain.FailureCouldNotConnect, nil, nil), domain.StatusUnhealthy, tNow, ptrTo(domain.FailureCouldNotConnect), nil},
		{"unhealthy recovers", domain.StatusUnhealthy, healthyResult(), domain.StatusHealthy, tNow, nil, nil},
		{"unhealthy fails for another reason", domain.StatusUnhealthy, failedResult(domain.FailureTimedOut, nil, nil), domain.StatusUnhealthy, t0, ptrTo(domain.FailureTimedOut), nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := record(t, savedState(tt.saved), tt.result)

			assert.Equal(t, tt.wantStatus, got.Status)
			require.NotNil(t, got.LastCheckedAt)
			assert.Equal(t, tNow, *got.LastCheckedAt)
			require.NotNil(t, got.LastStatusChangeAt)
			assert.Equal(t, tt.wantChange, *got.LastStatusChangeAt)
			assert.Equal(t, tt.wantCode, got.FailureCode)
			assert.Equal(t, tt.wantHTTP, got.FailureHTTPStatus)
			assert.Nil(t, got.FailureJSONRuleField)
		})
	}
}

func TestRecordCheckResult_FailureColumns(t *testing.T) {
	tests := []struct {
		name      string
		result    domain.CheckResult
		wantHTTP  *int
		wantField *string
	}{
		{"non_2xx_status keeps its status", failedResult(domain.FailureNon2xxStatus, ptrTo(503), nil), ptrTo(503), nil},
		{"json_rule_matched keeps its field", failedResult(domain.FailureJSONRuleMatched, nil, ptrTo("$.status")), nil, ptrTo("$.status")},
		{"timed_out drops a stray status", failedResult(domain.FailureTimedOut, ptrTo(503), ptrTo("$.x")), nil, nil},
		{"non_2xx_status without a status", failedResult(domain.FailureNon2xxStatus, nil, nil), nil, nil},
		{"non_2xx_status drops a stray field", failedResult(domain.FailureNon2xxStatus, ptrTo(404), ptrTo("$.x")), ptrTo(404), nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := record(t, savedState(domain.StatusNotYetChecked), tt.result)

			require.NotNil(t, got.FailureCode)
			assert.Equal(t, tt.result.Failure.Code, *got.FailureCode)
			assert.Equal(t, tt.wantHTTP, got.FailureHTTPStatus)
			assert.Equal(t, tt.wantField, got.FailureJSONRuleField)
		})
	}
}

func TestRecordCheckResult_UnhealthyHealthyUnhealthySequence(t *testing.T) {
	states := newFakeStates(savedState(domain.StatusNotYetChecked))
	fake := clock.NewFake(t0)
	svc := usecase.NewCheckResultService(states, fake)
	steps := []struct {
		result     domain.CheckResult
		wantStatus domain.Status
		wantChange time.Time
	}{
		{failedResult(domain.FailureTimedOut, nil, nil), domain.StatusUnhealthy, t0},
		{failedResult(domain.FailureTimedOut, nil, nil), domain.StatusUnhealthy, t0},
		{healthyResult(), domain.StatusHealthy, t0.Add(2 * time.Minute)},
		{healthyResult(), domain.StatusHealthy, t0.Add(2 * time.Minute)},
	}
	for i, step := range steps {
		require.NoError(t, svc.RecordCheckResult(t.Context(), svcID, step.result))
		got := states.states[svcID]
		assert.Equal(t, step.wantStatus, got.Status, "step %d", i)
		assert.Equal(t, step.wantChange, *got.LastStatusChangeAt, "step %d", i)
		assert.Equal(t, fake.Now(), *got.LastCheckedAt, "step %d", i)
		fake.Advance(time.Minute)
	}
}

func TestRecordCheckResult_RejectsInconsistentResult(t *testing.T) {
	tests := []struct {
		name   string
		result domain.CheckResult
	}{
		{"healthy with a failure", domain.CheckResult{Healthy: true, Failure: &domain.CheckFailure{Code: domain.FailureTimedOut}}},
		{"unhealthy without a failure", domain.CheckResult{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			saved := savedState(domain.StatusHealthy)
			states := newFakeStates(saved)
			svc := usecase.NewCheckResultService(states, clock.NewFake(tNow))

			require.Error(t, svc.RecordCheckResult(t.Context(), svcID, tt.result))
			assert.Equal(t, saved, states.states[svcID])
		})
	}
}

func TestRecordCheckResult_DeletedService(t *testing.T) {
	states := newFakeStates()
	svc := usecase.NewCheckResultService(states, clock.NewFake(tNow))

	require.NoError(t, svc.RecordCheckResult(t.Context(), "gone", healthyResult()))
	assert.Empty(t, states.states)

	// Baseline: the same call for a service that exists writes.
	states = newFakeStates(savedState(domain.StatusNotYetChecked))
	svc = usecase.NewCheckResultService(states, clock.NewFake(tNow))
	require.NoError(t, svc.RecordCheckResult(t.Context(), svcID, healthyResult()))
	assert.Equal(t, domain.StatusHealthy, states.states[svcID].Status)
}

func TestRecordCheckResult_RepositoryError(t *testing.T) {
	states := newFakeStates(savedState(domain.StatusHealthy))
	states.err = errBoom
	svc := usecase.NewCheckResultService(states, clock.NewFake(tNow))

	require.ErrorIs(t, svc.RecordCheckResult(t.Context(), svcID, healthyResult()), errBoom)
}

func TestRecordCheckResult_TimeFromClock(t *testing.T) {
	zone := time.FixedZone("x", 3*3600)
	states := newFakeStates(savedState(domain.StatusNotYetChecked))
	svc := usecase.NewCheckResultService(states, clock.NewFake(time.Date(2031, 1, 2, 3, 4, 5, 0, zone)))

	require.NoError(t, svc.RecordCheckResult(t.Context(), svcID, healthyResult()))

	got := states.states[svcID]
	want := time.Date(2031, 1, 2, 0, 4, 5, 0, time.UTC)
	assert.Equal(t, want, *got.LastCheckedAt)
	assert.Equal(t, want, *got.LastStatusChangeAt)
}
