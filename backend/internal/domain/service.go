// Package domain holds the entities and the errors the layers share. It depends on no
// other layer. The struct tags are the hand-kept mirror of the schema in
// backend/migration: there is no auto-migrate (ARCHITECTURE.md).
package domain

import "time"

// CheckType is how a service is checked (FR-33).
type CheckType string

// The check types.
const (
	CheckTypeHTTP CheckType = "http"
	CheckTypeTCP  CheckType = "tcp"
)

// BodyType is the type of an HTTP check's request body (FR-37).
type BodyType string

// The body types.
const (
	BodyTypeNone BodyType = "none"
	BodyTypeJSON BodyType = "json"
	BodyTypeText BodyType = "text"
	BodyTypeForm BodyType = "form"
)

// JSONRuleMode says whether the JSON rules fail a check when any matches or only when
// all match (FR-47).
type JSONRuleMode string

// The JSON rule modes.
const (
	JSONRuleModeAny JSONRuleMode = "any"
	JSONRuleModeAll JSONRuleMode = "all"
)

// NameValue is one query parameter or one header.
type NameValue struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// JSONRule names a field and the value that means failure (FR-44). FailingValue is a
// string or a bool.
type JSONRule struct {
	Field        string `json:"field"`
	FailingValue any    `json:"failing_value"`
}

// Service is a monitored service (table services).
type Service struct {
	ID      string `gorm:"column:id;primaryKey"`
	Name    string `gorm:"column:name"`
	NameKey string `gorm:"column:name_key"` // Name in lower case by Unicode rules; see ServiceNameKey

	CheckType CheckType `gorm:"column:check_type"`

	// HTTP checks. HTTPMethod and HTTPURL are nil for a TCP service.
	HTTPMethod      *string      `gorm:"column:http_method"`
	HTTPURL         *string      `gorm:"column:http_url"`
	HTTPQueryParams []NameValue  `gorm:"column:http_query_params;serializer:json"`
	HTTPHeaders     []NameValue  `gorm:"column:http_headers;serializer:json"`
	HTTPBodyType    BodyType     `gorm:"column:http_body_type"`
	HTTPBodyContent string       `gorm:"column:http_body_content"`
	JSONRules       []JSONRule   `gorm:"column:json_rules;serializer:json"`
	JSONRuleMode    JSONRuleMode `gorm:"column:json_rule_mode"`
	CertCheck       bool         `gorm:"column:cert_check_enabled"`
	CertMinDaysLeft *int         `gorm:"column:cert_min_days_left"`
	IgnoreCertErrs  bool         `gorm:"column:ignore_cert_errors"`

	// TCP checks. Nil for an HTTP service.
	TCPHost *string `gorm:"column:tcp_host"`
	TCPPort *int    `gorm:"column:tcp_port"`

	CheckIntervalSeconds int `gorm:"column:check_interval_seconds"`
	TimeoutSeconds       int `gorm:"column:timeout_seconds"`
	RetryCount           int `gorm:"column:retry_count"`
	RetryIntervalSeconds int `gorm:"column:retry_interval_seconds"`

	AlertsEnabled    bool   `gorm:"column:alerts_enabled"`
	UnhealthyMessage string `gorm:"column:unhealthy_message"` // empty means the default message
	RecoveryMessage  string `gorm:"column:recovery_message"`  // empty means the default message

	ShownOnPublicView bool `gorm:"column:shown_on_public_view"`
	Paused            bool `gorm:"column:paused"`

	CreatedAt time.Time `gorm:"column:created_at;autoCreateTime:false"`
	UpdatedAt time.Time `gorm:"column:updated_at;autoUpdateTime:false"`
}

// TableName is the table a Service is stored in.
func (Service) TableName() string { return "services" }

// Status is the current status of a service (FR-112).
type Status string

// The statuses.
const (
	StatusNotYetChecked Status = "not_yet_checked"
	StatusHealthy       Status = "healthy"
	StatusUnhealthy     Status = "unhealthy"
)

// FailureCode is why a check failed (FR-61).
type FailureCode string

// The failure reasons.
const (
	FailureTimedOut             FailureCode = "timed_out"
	FailureCouldNotConnect      FailureCode = "could_not_connect"
	FailureNon2xxStatus         FailureCode = "non_2xx_status"
	FailureJSONRuleMatched      FailureCode = "json_rule_matched"
	FailureInvalidOrMissingJSON FailureCode = "invalid_or_missing_json"
	FailureTooManyRedirects     FailureCode = "too_many_redirects"
	FailureCertificateProblem   FailureCode = "certificate_problem"
)

// ServiceState is the current state of one service (table service_states). Its row is
// created with the service and only the check-result usecase writes it.
type ServiceState struct {
	ServiceID            string       `gorm:"column:service_id;primaryKey"`
	Status               Status       `gorm:"column:status"`
	LastCheckedAt        *time.Time   `gorm:"column:last_checked_at"`
	LastStatusChangeAt   *time.Time   `gorm:"column:last_status_change_at"`
	FailureCode          *FailureCode `gorm:"column:failure_code"` // nil unless Status is unhealthy
	FailureHTTPStatus    *int         `gorm:"column:failure_http_status"`
	FailureJSONRuleField *string      `gorm:"column:failure_json_rule_field"`
}

// TableName is the table a ServiceState is stored in.
func (ServiceState) TableName() string { return "service_states" }
