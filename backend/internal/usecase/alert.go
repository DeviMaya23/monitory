package usecase

import (
	"strings"
	"time"

	"monitory/internal/domain"
)

// The default alert messages, used when the admin's text is empty.
const (
	DefaultUnhealthyMessage = "The service failed its check."
	DefaultRecoveryMessage  = "The service is healthy again."
)

// TestAlertMessage is the message of a test alert (FR-107).
const TestAlertMessage = "This is a test alert from Monitory. No service has changed status."

// buildTestAlert makes the test alert for a service at changedAt. The name is the
// service's saved one; nothing else of the service is used.
func buildTestAlert(service domain.Service, changedAt time.Time) domain.Alert {
	return domain.Alert{
		ServiceID:   service.ID,
		ServiceName: service.Name,
		Status:      domain.AlertTest,
		ChangedAt:   changedAt.UTC(),
		Message:     TestAlertMessage,
	}
}

// buildAlert makes the alert for a change of service to status at changedAt. The message
// is the service's own for that status, or the default when it is empty or only
// whitespace (FR-23).
func buildAlert(service domain.Service, status domain.AlertStatus, changedAt time.Time) domain.Alert {
	message, fallback := service.UnhealthyMessage, DefaultUnhealthyMessage
	if status == domain.AlertHealthy {
		message, fallback = service.RecoveryMessage, DefaultRecoveryMessage
	}
	if strings.TrimSpace(message) == "" {
		message = fallback
	}
	return domain.Alert{
		ServiceID:   service.ID,
		ServiceName: service.Name,
		Status:      status,
		ChangedAt:   changedAt.UTC(),
		Message:     message,
	}
}
