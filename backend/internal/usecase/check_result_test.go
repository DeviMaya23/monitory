package usecase_test

import (
	"context"
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
	svc := usecase.NewCheckResultService(states, &fakeFinder{}, &fakeLister{}, &spyDispatcher{}, clock.NewFake(tNow))
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
	svc := usecase.NewCheckResultService(states, &fakeFinder{}, &fakeLister{}, &spyDispatcher{}, fake)
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
			svc := usecase.NewCheckResultService(states, &fakeFinder{}, &fakeLister{}, &spyDispatcher{}, clock.NewFake(tNow))

			require.Error(t, svc.RecordCheckResult(t.Context(), svcID, tt.result))
			assert.Equal(t, saved, states.states[svcID])
		})
	}
}

func TestRecordCheckResult_DeletedService(t *testing.T) {
	states := newFakeStates()
	svc := usecase.NewCheckResultService(states, &fakeFinder{}, &fakeLister{}, &spyDispatcher{}, clock.NewFake(tNow))

	require.NoError(t, svc.RecordCheckResult(t.Context(), "gone", healthyResult()))
	assert.Empty(t, states.states)

	// Baseline: the same call for a service that exists writes.
	states = newFakeStates(savedState(domain.StatusNotYetChecked))
	svc = usecase.NewCheckResultService(states, &fakeFinder{}, &fakeLister{}, &spyDispatcher{}, clock.NewFake(tNow))
	require.NoError(t, svc.RecordCheckResult(t.Context(), svcID, healthyResult()))
	assert.Equal(t, domain.StatusHealthy, states.states[svcID].Status)
}

func TestRecordCheckResult_RepositoryError(t *testing.T) {
	states := newFakeStates(savedState(domain.StatusHealthy))
	states.err = errBoom
	svc := usecase.NewCheckResultService(states, &fakeFinder{}, &fakeLister{}, &spyDispatcher{}, clock.NewFake(tNow))

	require.ErrorIs(t, svc.RecordCheckResult(t.Context(), svcID, healthyResult()), errBoom)
}

func TestRecordCheckResult_TimeFromClock(t *testing.T) {
	zone := time.FixedZone("x", 3*3600)
	states := newFakeStates(savedState(domain.StatusNotYetChecked))
	svc := usecase.NewCheckResultService(states, &fakeFinder{}, &fakeLister{}, &spyDispatcher{}, clock.NewFake(time.Date(2031, 1, 2, 3, 4, 5, 0, zone)))

	require.NoError(t, svc.RecordCheckResult(t.Context(), svcID, healthyResult()))

	got := states.states[svcID]
	want := time.Date(2031, 1, 2, 0, 4, 5, 0, time.UTC)
	assert.Equal(t, want, *got.LastCheckedAt)
	assert.Equal(t, want, *got.LastStatusChangeAt)
}

// alertSetup is one service with alerts on and an email target, ready to record results.
type alertSetup struct {
	states *fakeStates
	finder *fakeFinder
	lister *fakeLister
	spy    *spyDispatcher
	svc    *usecase.CheckResultService
	clock  *clock.Fake
}

var emailTarget = domain.Target{ID: "t-1", ServiceID: svcID, Type: domain.TargetTypeEmail, Value: "ops@example.com"}

func alertService() domain.Service {
	return domain.Service{ID: svcID, Name: "API", AlertsEnabled: true}
}

func newAlertSetup(saved domain.Status, service domain.Service, targets ...domain.Target) *alertSetup {
	a := &alertSetup{
		states: newFakeStates(savedState(saved)),
		finder: newFakeFinder(service),
		lister: newFakeLister(svcID, targets...),
		clock:  clock.NewFake(tNow),
	}
	a.spy = &spyDispatcher{states: a.states}
	a.svc = usecase.NewCheckResultService(a.states, a.finder, a.lister, a.spy, a.clock)
	return a
}

func unhealthyResult() domain.CheckResult { return failedResult(domain.FailureTimedOut, nil, nil) }

func TestRecordCheckResult_AlertDecision(t *testing.T) {
	tests := []struct {
		name   string
		saved  domain.Status
		result domain.CheckResult
		want   domain.AlertStatus // empty: no alert
	}{
		{"first check unhealthy (FR-24)", domain.StatusNotYetChecked, unhealthyResult(), domain.AlertUnhealthy},
		{"healthy to unhealthy (FR-21)", domain.StatusHealthy, unhealthyResult(), domain.AlertUnhealthy},
		{"unhealthy to healthy (FR-22)", domain.StatusUnhealthy, healthyResult(), domain.AlertHealthy},
		{"first check healthy (FR-24)", domain.StatusNotYetChecked, healthyResult(), ""},
		{"healthy stays healthy", domain.StatusHealthy, healthyResult(), ""},
		{"unhealthy stays unhealthy (FR-25)", domain.StatusUnhealthy, unhealthyResult(), ""},
		{"unhealthy stays unhealthy, other reason", domain.StatusUnhealthy, failedResult(domain.FailureCouldNotConnect, nil, nil), ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a := newAlertSetup(tt.saved, alertService(), emailTarget)

			require.NoError(t, a.svc.RecordCheckResult(t.Context(), svcID, tt.result))

			if tt.want == "" {
				assert.Empty(t, a.spy.calls)
				return
			}
			require.Len(t, a.spy.calls, 1)
			assert.Equal(t, tt.want, a.spy.calls[0].alert.Status)
			assert.Equal(t, []domain.Target{emailTarget}, a.spy.calls[0].targets)
		})
	}
}

func TestRecordCheckResult_AlertsOffThenOn(t *testing.T) {
	service := alertService()
	service.AlertsEnabled = false
	a := newAlertSetup(domain.StatusHealthy, service, emailTarget)

	require.NoError(t, a.svc.RecordCheckResult(t.Context(), svcID, unhealthyResult()))
	assert.Empty(t, a.spy.calls, "alerts off at the change")

	service.AlertsEnabled = true
	a.finder.services[svcID] = service
	require.NoError(t, a.svc.RecordCheckResult(t.Context(), svcID, unhealthyResult()))
	assert.Empty(t, a.spy.calls, "turned on while still unhealthy (FR-25)")

	require.NoError(t, a.svc.RecordCheckResult(t.Context(), svcID, healthyResult()))
	require.Len(t, a.spy.calls, 1)
	assert.Equal(t, domain.AlertHealthy, a.spy.calls[0].alert.Status)
}

func TestRecordCheckResult_Targets(t *testing.T) {
	t.Run("an empty list dispatches nothing", func(t *testing.T) {
		a := newAlertSetup(domain.StatusHealthy, alertService())
		require.NoError(t, a.svc.RecordCheckResult(t.Context(), svcID, unhealthyResult()))
		assert.Empty(t, a.spy.calls)
		assert.Equal(t, 1, len(a.lister.ctxErrs), "baseline: the list was read")
	})
	t.Run("one dispatch with every target in list order", func(t *testing.T) {
		webhook := domain.Target{ID: "t-2", ServiceID: svcID, Type: domain.TargetTypeWebhook, Value: "https://hook.example"}
		a := newAlertSetup(domain.StatusHealthy, alertService(), emailTarget, webhook)
		require.NoError(t, a.svc.RecordCheckResult(t.Context(), svcID, unhealthyResult()))
		require.Len(t, a.spy.calls, 1)
		assert.Equal(t, []domain.Target{emailTarget, webhook}, a.spy.calls[0].targets)
	})
}

func TestRecordCheckResult_AlertContent(t *testing.T) {
	service := alertService()
	a := newAlertSetup(domain.StatusHealthy, service, emailTarget)

	require.NoError(t, a.svc.RecordCheckResult(t.Context(), svcID, unhealthyResult()))

	require.Len(t, a.spy.calls, 1)
	saved := a.states.states[svcID]
	require.NotNil(t, saved.LastStatusChangeAt)
	assert.Equal(t, tNow, *saved.LastStatusChangeAt)
	assert.Equal(t, domain.Alert{
		ServiceID:   svcID,
		ServiceName: "API",
		Status:      domain.AlertUnhealthy,
		ChangedAt:   tNow,
		Message:     usecase.DefaultUnhealthyMessage,
	}, a.spy.calls[0].alert)
}

func TestRecordCheckResult_StateSavedBeforeDispatch(t *testing.T) {
	a := newAlertSetup(domain.StatusHealthy, alertService(), emailTarget)

	require.NoError(t, a.svc.RecordCheckResult(t.Context(), svcID, unhealthyResult()))

	require.Len(t, a.spy.calls, 1)
	assert.Equal(t, domain.StatusUnhealthy, a.spy.calls[0].stateAtCall[svcID].Status)
}

func TestRecordCheckResult_CancelledAfterSave(t *testing.T) {
	a := newAlertSetup(domain.StatusHealthy, alertService(), emailTarget)
	ctx, cancel := context.WithCancel(t.Context())
	a.states.afterApply = func(updateCtx context.Context) {
		assert.Equal(t, ctx, updateCtx)
		cancel()
	}

	require.NoError(t, a.svc.RecordCheckResult(ctx, svcID, unhealthyResult()))

	require.Error(t, ctx.Err(), "baseline: the sequence's context was cancelled")
	assert.Equal(t, []error{nil}, a.finder.ctxErrs)
	assert.Equal(t, []error{nil}, a.lister.ctxErrs)
	assert.Len(t, a.spy.calls, 1)
}

func TestRecordCheckResult_AlertErrors(t *testing.T) {
	t.Run("a failing update is returned and nothing is dispatched", func(t *testing.T) {
		a := newAlertSetup(domain.StatusHealthy, alertService(), emailTarget)
		a.states.err = errBoom
		require.ErrorIs(t, a.svc.RecordCheckResult(t.Context(), svcID, unhealthyResult()), errBoom)
		assert.Empty(t, a.spy.calls)
		assert.Empty(t, a.finder.ctxErrs)
	})
	t.Run("a deleted service is dropped without a read", func(t *testing.T) {
		a := newAlertSetup(domain.StatusHealthy, alertService(), emailTarget)
		delete(a.states.states, svcID)
		require.NoError(t, a.svc.RecordCheckResult(t.Context(), svcID, unhealthyResult()))
		assert.Empty(t, a.spy.calls)
		assert.Empty(t, a.finder.ctxErrs)
	})
	t.Run("a service gone since the save", func(t *testing.T) {
		a := newAlertSetup(domain.StatusHealthy, alertService(), emailTarget)
		delete(a.finder.services, svcID)
		require.NoError(t, a.svc.RecordCheckResult(t.Context(), svcID, unhealthyResult()))
		assert.Empty(t, a.spy.calls)
		assert.Equal(t, domain.StatusUnhealthy, a.states.states[svcID].Status)
	})
	t.Run("targets gone since the save", func(t *testing.T) {
		a := newAlertSetup(domain.StatusHealthy, alertService(), emailTarget)
		delete(a.lister.targets, svcID)
		require.NoError(t, a.svc.RecordCheckResult(t.Context(), svcID, unhealthyResult()))
		assert.Empty(t, a.spy.calls)
	})
	t.Run("a failing find is wrapped, the state is saved", func(t *testing.T) {
		a := newAlertSetup(domain.StatusHealthy, alertService(), emailTarget)
		a.finder.err = errBoom
		require.ErrorIs(t, a.svc.RecordCheckResult(t.Context(), svcID, unhealthyResult()), errBoom)
		assert.Empty(t, a.spy.calls)
		assert.Equal(t, domain.StatusUnhealthy, a.states.states[svcID].Status)
	})
	t.Run("a failing list is wrapped, the state is saved", func(t *testing.T) {
		a := newAlertSetup(domain.StatusHealthy, alertService(), emailTarget)
		a.lister.err = errBoom
		require.ErrorIs(t, a.svc.RecordCheckResult(t.Context(), svcID, unhealthyResult()), errBoom)
		assert.Empty(t, a.spy.calls)
		assert.Equal(t, domain.StatusUnhealthy, a.states.states[svcID].Status)
	})
}

func TestRecordCheckResult_InconsistentResultDoesNotDispatch(t *testing.T) {
	a := newAlertSetup(domain.StatusHealthy, alertService(), emailTarget)

	require.Error(t, a.svc.RecordCheckResult(t.Context(), svcID, domain.CheckResult{}))
	assert.Empty(t, a.spy.calls)

	// Baseline: a consistent result for the same setup alerts.
	require.NoError(t, a.svc.RecordCheckResult(t.Context(), svcID, unhealthyResult()))
	assert.Len(t, a.spy.calls, 1)
}

func TestRecordCheckResult_RestartUsesSavedStatusOnly(t *testing.T) {
	tests := []struct {
		name   string
		saved  domain.Status
		result domain.CheckResult
		want   domain.AlertStatus
	}{
		{"unhealthy, still unhealthy", domain.StatusUnhealthy, unhealthyResult(), ""},
		{"unhealthy, recovered", domain.StatusUnhealthy, healthyResult(), domain.AlertHealthy},
		{"healthy, now unhealthy", domain.StatusHealthy, unhealthyResult(), domain.AlertUnhealthy},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a := newAlertSetup(tt.saved, alertService(), emailTarget)
			// A second usecase over the same saved states, as after a restart.
			second := usecase.NewCheckResultService(a.states, a.finder, a.lister, a.spy, a.clock)

			require.NoError(t, second.RecordCheckResult(t.Context(), svcID, tt.result))

			if tt.want == "" {
				assert.Empty(t, a.spy.calls)
				return
			}
			require.Len(t, a.spy.calls, 1)
			assert.Equal(t, tt.want, a.spy.calls[0].alert.Status)
		})
	}
}
