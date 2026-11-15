package domain_test

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"monitory/internal/domain"
)

func TestServiceNameKey(t *testing.T) {
	tests := []struct {
		name string
		a, b string
		same bool
	}{
		{"ASCII case is ignored", "Payments API", "payments api", true},
		{"non-English case is ignored", "CAFÉ", "café", true},
		{"different names stay different", "api", "api-2", false},
		{"spaces are significant", "api", "api ", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.same, domain.ServiceNameKey(tt.a) == domain.ServiceNameKey(tt.b))
		})
	}
}

func TestTargetValueKey(t *testing.T) {
	assert.Equal(t,
		domain.TargetValueKey(domain.TargetTypeEmail, "Ops@Example.com"),
		domain.TargetValueKey(domain.TargetTypeEmail, "ops@example.com"),
		"an email address ignores case")
	assert.NotEqual(t,
		domain.TargetValueKey(domain.TargetTypeWebhook, "https://example.com/Hook"),
		domain.TargetValueKey(domain.TargetTypeWebhook, "https://example.com/hook"),
		"a webhook URL is compared exactly")
}
