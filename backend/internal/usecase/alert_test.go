package usecase_test

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/usecase"
)

func TestAlertMessage(t *testing.T) {
	long := strings.Repeat("x", 500)
	tests := []struct {
		name      string
		unhealthy string
		recovery  string
		saved     domain.Status
		result    domain.CheckResult
		want      string
	}{
		{"unhealthy uses its own message", "down!", "up!", domain.StatusHealthy, unhealthyResult(), "down!"},
		{"recovery uses its own message", "down!", "up!", domain.StatusUnhealthy, healthyResult(), "up!"},
		{"empty unhealthy message gets the default", "", "up!", domain.StatusHealthy, unhealthyResult(), "The service failed its check."},
		{"empty recovery message gets the default", "down!", "", domain.StatusUnhealthy, healthyResult(), "The service is healthy again."},
		{"blank unhealthy message gets the default", " \t\n ", "up!", domain.StatusHealthy, unhealthyResult(), "The service failed its check."},
		{"blank recovery message gets the default", "down!", "  ", domain.StatusUnhealthy, healthyResult(), "The service is healthy again."},
		{"500 characters pass unchanged", long, "up!", domain.StatusHealthy, unhealthyResult(), long},
		{"an admin message is not trimmed", "  down\nnow  ", "up!", domain.StatusHealthy, unhealthyResult(), "  down\nnow  "},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			service := alertService()
			service.UnhealthyMessage, service.RecoveryMessage = tt.unhealthy, tt.recovery
			a := newAlertSetup(tt.saved, service, emailTarget)

			require.NoError(t, a.svc.RecordCheckResult(t.Context(), svcID, tt.result))

			require.Len(t, a.spy.calls, 1)
			assert.Equal(t, tt.want, a.spy.calls[0].alert.Message)
		})
	}
}

func TestDefaultMessages(t *testing.T) {
	assert.Equal(t, "The service failed its check.", usecase.DefaultUnhealthyMessage)
	assert.Equal(t, "The service is healthy again.", usecase.DefaultRecoveryMessage)
}

func TestTestAlertMessage(t *testing.T) {
	assert.Equal(t, "This is a test alert from Monitory. No service has changed status.", usecase.TestAlertMessage)
	assert.NotContains(t, usecase.TestAlertMessage, "<")
	assert.NotContains(t, usecase.TestAlertMessage, ">")
}

// The builder of the test alert is unexported; these reach it through TestTarget.
func TestBuildTestAlert(t *testing.T) {
	s := newTesterSetup()
	// Fields of the service that must not reach the alert.
	s.finder.service = domain.Service{ID: "svc-1", Name: "API", AlertsEnabled: true, UnhealthyMessage: "down!", RecoveryMessage: "up!"}

	_, err := s.svc.TestTarget(t.Context(), "svc-1", validEmailTarget())
	require.NoError(t, err)
	_, err = s.svc.TestTarget(t.Context(), "svc-1", validEmailTarget())
	require.NoError(t, err)

	require.Len(t, s.mail.calls, 2)
	assert.Equal(t, domain.Alert{
		ServiceID: "svc-1", ServiceName: "API", Status: domain.AlertTest,
		ChangedAt: time.Date(2026, 11, 18, 14, 5, 59, 0, time.UTC), Message: usecase.TestAlertMessage,
	}, s.mail.calls[0].alert)
	assert.Equal(t, time.UTC, s.mail.calls[0].alert.ChangedAt.Location(), "the time is converted to UTC")
	assert.Equal(t, s.mail.calls[0].alert, s.mail.calls[1].alert, "the same inputs give the same alert")
}

func TestBuildTestAlert_NameIsPlainText(t *testing.T) {
	s := newTesterSetup()
	name := "<b>x</b> \"quoted\""
	s.finder.service.Name = name

	_, err := s.svc.TestTarget(t.Context(), "svc-1", validWebhookTarget())
	require.NoError(t, err)

	require.Len(t, s.webhooks.calls, 1)
	assert.Equal(t, name, s.webhooks.calls[0].alert.ServiceName)
}
