package usecase_test

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/usecase"
)

type publicSetup struct {
	svc      *usecase.PublicViewService
	limiter  *fakeLimiter
	settings *fakeSettings
	services *fakePublicServices
}

func newPublicView(viewOn bool) publicSetup {
	s := publicSetup{
		limiter:  &fakeLimiter{allowed: true},
		settings: &fakeSettings{publicViewEnabled: viewOn},
		services: &fakePublicServices{},
	}
	s.svc = usecase.NewPublicViewService(s.limiter, s.settings, s.services)
	return s
}

var publicChecked = time.Date(2026, 6, 7, 8, 9, 10, 0, time.UTC)

func TestPublicView_ReturnsTheRepositorysServicesInItsOrder(t *testing.T) {
	s := newPublicView(true)
	want := []domain.PublicService{
		{Name: "alpha", Status: domain.StatusHealthy, LastCheckedAt: publicChecked},
		{Name: "Bravo", Status: domain.StatusUnhealthy, LastCheckedAt: publicChecked},
	}
	s.services.services = want

	got, err := s.svc.PublicDashboard(t.Context(), "203.0.113.9")

	require.NoError(t, err)
	assert.Equal(t, want, got)
	assert.Equal(t, []string{"203.0.113.9"}, s.limiter.keys)
	assert.Equal(t, 1, s.services.reads)
}

func TestPublicView_ViewOffIsUnavailableAndStillCounted(t *testing.T) {
	off := newPublicView(false)
	on := newPublicView(true)

	_, err := off.svc.PublicDashboard(t.Context(), "a")
	_, onErr := on.svc.PublicDashboard(t.Context(), "a")

	require.ErrorIs(t, err, domain.ErrPublicViewUnavailable)
	assert.Zero(t, off.services.reads)
	assert.Equal(t, []string{"a"}, off.limiter.keys, "a request answered 404 counts")
	require.NoError(t, onErr)
	assert.Equal(t, 1, on.services.reads, "baseline: with the view on the services are read")
}

func TestPublicView_LimitedReadsNothingElse(t *testing.T) {
	s := newPublicView(true)
	s.limiter.allowed, s.limiter.wait = false, 37*time.Second

	got, err := s.svc.PublicDashboard(t.Context(), "a")

	var limited domain.RateLimitedError
	require.ErrorAs(t, err, &limited)
	assert.Equal(t, 37, limited.RetryAfterSeconds)
	assert.Nil(t, got)
	assert.Zero(t, s.settings.reads)
	assert.Zero(t, s.services.reads)
}

func TestPublicView_LimitIsCheckedBeforeTheViewSwitch(t *testing.T) {
	s := newPublicView(false)
	s.limiter.allowed, s.limiter.wait = false, time.Second

	_, err := s.svc.PublicDashboard(t.Context(), "a")

	var limited domain.RateLimitedError
	require.ErrorAs(t, err, &limited)
	assert.NotErrorIs(t, err, domain.ErrPublicViewUnavailable)
}

func TestPublicView_RetryAfterIsTheWaitRoundedUpToWholeSeconds(t *testing.T) {
	tests := []struct {
		wait time.Duration
		want int
	}{
		{time.Nanosecond, 1},
		{400 * time.Millisecond, 1},
		{time.Second, 1},
		{time.Second + time.Millisecond, 2},
		{59*time.Second + 500*time.Millisecond, 60},
		{60 * time.Second, 60},
	}
	for _, tt := range tests {
		t.Run(tt.wait.String(), func(t *testing.T) {
			s := newPublicView(true)
			s.limiter.allowed, s.limiter.wait = false, tt.wait

			_, err := s.svc.PublicDashboard(t.Context(), "a")

			var limited domain.RateLimitedError
			require.ErrorAs(t, err, &limited)
			assert.Equal(t, tt.want, limited.RetryAfterSeconds)
		})
	}
}

func TestPublicView_FailedReadsAreNotTheViewBeingOff(t *testing.T) {
	boom := errors.New("database is down")

	t.Run("setting", func(t *testing.T) {
		s := newPublicView(true)
		s.settings.err = boom

		_, err := s.svc.PublicDashboard(t.Context(), "a")

		require.ErrorIs(t, err, boom)
		assert.NotErrorIs(t, err, domain.ErrPublicViewUnavailable)
	})
	t.Run("services", func(t *testing.T) {
		s := newPublicView(true)
		s.services.err = boom

		_, err := s.svc.PublicDashboard(t.Context(), "a")

		require.ErrorIs(t, err, boom)
		assert.NotErrorIs(t, err, domain.ErrPublicViewUnavailable)
	})
}

func TestPublicView_NoServicesIsAnEmptyNonNilSlice(t *testing.T) {
	s := newPublicView(true)
	s.services.services = nil

	got, err := s.svc.PublicDashboard(t.Context(), "a")

	require.NoError(t, err)
	assert.NotNil(t, got)
	assert.Empty(t, got)
}
