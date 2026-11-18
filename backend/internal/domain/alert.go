package domain

import "time"

// AlertStatus is the status an alert reports. The strings are the ones of the
// contract's WebhookAlertPayload.
type AlertStatus string

// The alert statuses.
const (
	AlertUnhealthy AlertStatus = "unhealthy"
	AlertHealthy   AlertStatus = "healthy"
)

// Alert is what a status change sends to a target (FR-23): the service's name, the new
// status, the time of the change and the message, and nothing else of the service.
// ServiceID is used only to log; it is never sent.
type Alert struct {
	ServiceID   string
	ServiceName string
	Status      AlertStatus
	ChangedAt   time.Time
	Message     string
}
