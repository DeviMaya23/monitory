package config_test

import (
	"os"
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/platform/config"
)

// env builds a Lookup over the admin credentials plus the given overrides.
// An override with an empty value removes the key.
func env(overrides map[string]string) config.Lookup {
	values := map[string]string{"ADMIN_USERNAME": "admin", "ADMIN_PASSWORD": "a-password"}
	for k, v := range overrides {
		values[k] = v
	}
	return func(key string) (string, bool) {
		v, ok := values[key]
		return v, ok
	}
}

func TestLoad_Defaults(t *testing.T) {
	cfg, err := config.LoadFrom(env(nil))
	require.NoError(t, err)

	assert.Equal(t, "admin", cfg.AdminUsername)
	assert.Equal(t, "a-password", cfg.AdminPassword)
	assert.Equal(t, ":8080", cfg.ListenAddr)
	assert.Equal(t, "./data/monitory.db", cfg.DatabasePath)
	assert.True(t, cfg.RequireHTTPS, "require HTTPS is on by default (FR-97)")
	assert.False(t, cfg.TrustProxy, "proxy trust is off by default (FR-99)")
	assert.Equal(t, "X-Forwarded-For", cfg.ClientIPHeader)
	assert.Equal(t, config.SMTP{Port: 587, TLS: "starttls"}, cfg.SMTP)

	assert.Equal(t, config.Limits{
		CheckInterval: config.Range{Default: 60, Min: 30, Max: 86400},
		Timeout:       config.Range{Default: 10, Min: 1, Max: 60},
		RetryCount:    config.Range{Default: 2, Min: 0, Max: 5},
		RetryInterval: config.Range{Default: 10, Min: 1, Max: 300},

		MaxRedirects:          3,
		ServiceNameMaxLength:  100,
		MaxServices:           50,
		MaxTargetsPerService:  5,
		MaxJSONRules:          10,
		ResponseBodyMaxBytes:  65536,
		RequestURLMaxLength:   2048,
		RequestMaxQueryParams: 20,
		RequestMaxHeaders:     20,
		HeaderNameMaxLength:   128,
		HeaderValueMaxLength:  4096,
		RequestBodyMaxBytes:   65536,
		APIRequestMaxBytes:    1048576,
		EmailMaxLength:        254,
		WebhookURLMaxLength:   2048,

		PublicRateLimitPerMinute:          60,
		AlertDeliveryRetries:              3,
		AlertDeliveryRetryIntervalSeconds: 30,
		WebhookTimeoutSeconds:             10,
	}, cfg.Limits)
}

func TestLoad_ReadsConfiguredValues(t *testing.T) {
	cfg, err := config.LoadFrom(env(map[string]string{
		"LISTEN_ADDR":                  ":9000",
		"DATABASE_PATH":                "/data/monitory.db",
		"REQUIRE_HTTPS":                "false",
		"TRUST_PROXY":                  "true",
		"CLIENT_IP_HEADER":             "Fly-Client-IP",
		"SMTP_HOST":                    "localhost",
		"SMTP_PORT":                    "1025",
		"SMTP_TLS":                     "none",
		"SMTP_FROM":                    "monitor@example.test",
		"MAX_SERVICES":                 "7",
		"RETRY_COUNT_MAX":              "9",
		"TIMEOUT_DEFAULT_SECONDS":      "20",
		"PUBLIC_RATE_LIMIT_PER_MINUTE": "5",
	}))
	require.NoError(t, err)

	assert.Equal(t, ":9000", cfg.ListenAddr)
	assert.Equal(t, "/data/monitory.db", cfg.DatabasePath)
	assert.False(t, cfg.RequireHTTPS)
	assert.True(t, cfg.TrustProxy)
	assert.Equal(t, "Fly-Client-IP", cfg.ClientIPHeader)
	assert.Equal(t, config.SMTP{Host: "localhost", Port: 1025, TLS: "none", From: "monitor@example.test"}, cfg.SMTP)
	assert.Equal(t, 7, cfg.Limits.MaxServices)
	assert.Equal(t, 9, cfg.Limits.RetryCount.Max)
	assert.Equal(t, 20, cfg.Limits.Timeout.Default)
	assert.Equal(t, 5, cfg.Limits.PublicRateLimitPerMinute)
}

// FR-102: a missing credential stops the start, and the error names the setting.
func TestLoad_MissingCredentialNamesTheKey(t *testing.T) {
	for _, key := range []string{"ADMIN_USERNAME", "ADMIN_PASSWORD"} {
		t.Run(key, func(t *testing.T) {
			_, err := config.LoadFrom(env(map[string]string{key: ""}))
			require.Error(t, err)
			assert.Contains(t, err.Error(), key+" is not set")
		})
	}
}

func TestLoad_ReportsEveryProblemAtOnce(t *testing.T) {
	_, err := config.LoadFrom(func(string) (string, bool) { return "", false })
	require.Error(t, err)
	assert.Contains(t, err.Error(), "ADMIN_USERNAME is not set")
	assert.Contains(t, err.Error(), "ADMIN_PASSWORD is not set")
}

func TestLoad_InvalidValues(t *testing.T) {
	tests := []struct {
		name      string
		overrides map[string]string
		wantKey   string
	}{
		{"boolean that is not true or false", map[string]string{"REQUIRE_HTTPS": "yes"}, "REQUIRE_HTTPS"},
		{"trust proxy that is not true or false", map[string]string{"TRUST_PROXY": "1"}, "TRUST_PROXY"},
		{"number that is not a number", map[string]string{"MAX_SERVICES": "many"}, "MAX_SERVICES"},
		{"number below its floor", map[string]string{"MAX_SERVICES": "0"}, "MAX_SERVICES"},
		{"negative retry count", map[string]string{"RETRY_COUNT_MIN": "-1"}, "RETRY_COUNT_MIN"},
		{"minimum above maximum", map[string]string{"TIMEOUT_MIN_SECONDS": "90"}, "TIMEOUT_MIN_SECONDS"},
		{"default outside the limits", map[string]string{"CHECK_INTERVAL_DEFAULT_SECONDS": "10"}, "CHECK_INTERVAL_DEFAULT_SECONDS"},
		{"header name with a space", map[string]string{"CLIENT_IP_HEADER": "X Real IP"}, "CLIENT_IP_HEADER"},
		{"unknown SMTP TLS mode", map[string]string{"SMTP_TLS": "ssl"}, "SMTP_TLS"},
		{"SMTP port out of range", map[string]string{"SMTP_PORT": "70000"}, "SMTP_PORT"},
		{"SMTP host without a sender", map[string]string{"SMTP_HOST": "smtp.example.test"}, "SMTP_FROM"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := config.LoadFrom(env(tt.overrides))
			require.Error(t, err)
			assert.Contains(t, err.Error(), tt.wantKey)
		})
	}
}

// An error names a key and never a value, so a secret cannot reach the log.
func TestLoad_ErrorsNeverContainValues(t *testing.T) {
	_, err := config.LoadFrom(env(map[string]string{"SMTP_PORT": "s3cret-typed-in-the-wrong-box"}))
	require.Error(t, err)
	assert.NotContains(t, err.Error(), "s3cret")
}

// Every key the configuration reads is documented in .env.example, and .env.example
// lists no key the configuration does not read.
func TestKeys_MatchEnvExample(t *testing.T) {
	example, err := os.ReadFile("../../../../.env.example")
	require.NoError(t, err)

	var documented []string
	for _, m := range regexp.MustCompile(`(?m)^([A-Z][A-Z0-9_]*)=`).FindAllStringSubmatch(string(example), -1) {
		documented = append(documented, m[1])
	}
	assert.ElementsMatch(t, documented, config.Keys())
}
