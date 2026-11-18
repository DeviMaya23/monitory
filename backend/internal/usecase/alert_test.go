package usecase_test

import (
	"strings"
	"testing"

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
