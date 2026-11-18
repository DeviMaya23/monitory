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
