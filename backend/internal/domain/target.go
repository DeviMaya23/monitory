package domain

import "time"

// TargetType is the kind of contact a notification target is (FR-81).
type TargetType string

// The target types.
const (
	TargetTypeEmail   TargetType = "email"
	TargetTypeWebhook TargetType = "webhook"
)

// Target is a notification target on one service's alert list (table targets).
type Target struct {
	ID        string     `gorm:"column:id;primaryKey"`
	ServiceID string     `gorm:"column:service_id"`
	Name      string     `gorm:"column:name"` // empty when none was given
	Type      TargetType `gorm:"column:type"`
	Value     string     `gorm:"column:value"`     // the email address or the webhook URL
	ValueKey  string     `gorm:"column:value_key"` // what duplicates are compared by; see TargetValueKey

	Headers []NameValue `gorm:"column:headers;serializer:json"` // webhook only

	// LastDeliveryFailed is written only by the delivery-outcome usecase (FR-86).
	LastDeliveryFailed bool `gorm:"column:last_delivery_failed"`

	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime:false"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime:false"`
}

// TableName is the table a Target is stored in.
func (Target) TableName() string { return "targets" }
