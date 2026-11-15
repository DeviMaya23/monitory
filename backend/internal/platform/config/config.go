// Package config parses the deployment configuration from environment variables.
// It is the only package that reads the environment, and every key it reads is in
// .env.example (a test checks that).
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Range is a per-service setting's default and the limits the admin's value must stay within (FR-57).
type Range struct {
	Default int
	Min     int
	Max     int
}

// SMTP is the account email alerts are sent through. An empty Host means no SMTP
// account is configured (FR-85).
type SMTP struct {
	Host     string
	Port     int
	TLS      string // "starttls", "tls" or "none"
	Username string
	Password string // never logged
	From     string
}

// Limits holds every limit the requirements say must not be hardcoded.
type Limits struct {
	CheckInterval Range // seconds
	Timeout       Range // seconds
	RetryCount    Range
	RetryInterval Range // seconds

	MaxRedirects          int
	ServiceNameMaxLength  int
	MaxServices           int
	MaxTargetsPerService  int
	MaxJSONRules          int
	ResponseBodyMaxBytes  int
	RequestURLMaxLength   int
	RequestMaxQueryParams int
	RequestMaxHeaders     int
	HeaderNameMaxLength   int
	HeaderValueMaxLength  int
	RequestBodyMaxBytes   int
	APIRequestMaxBytes    int
	EmailMaxLength        int
	WebhookURLMaxLength   int

	PublicRateLimitPerMinute          int
	AlertDeliveryRetries              int
	AlertDeliveryRetryIntervalSeconds int
	WebhookTimeoutSeconds             int
}

// Config holds the process-wide settings.
type Config struct {
	AdminUsername string
	AdminPassword string // never logged

	ListenAddr   string
	DatabasePath string

	RequireHTTPS   bool
	TrustProxy     bool
	ClientIPHeader string

	SMTP   SMTP
	Limits Limits
}

// Lookup returns the value of an environment variable and whether it is set.
// os.LookupEnv satisfies it.
type Lookup func(key string) (string, bool)

// Load reads the configuration from the process environment.
func Load() (Config, error) {
	cfg, _, err := load(os.LookupEnv)
	return cfg, err
}

// LoadFrom reads the configuration through lookup. Tests use it.
func LoadFrom(lookup Lookup) (Config, error) {
	cfg, _, err := load(lookup)
	return cfg, err
}

// Keys returns every environment variable name the configuration reads.
func Keys() []string {
	_, keys, _ := load(func(string) (string, bool) { return "", false })
	return keys
}

// reader reads keys through a Lookup, remembers each key it was asked for, and
// collects every problem so that one start reports all of them. An error names a
// key and never a value.
type reader struct {
	lookup Lookup
	keys   []string
	errs   []error
}

func (r *reader) raw(key string) (string, bool) {
	r.keys = append(r.keys, key)
	v, ok := r.lookup(key)
	if !ok || v == "" {
		return "", false
	}
	return v, true
}

func (r *reader) required(key string) string {
	v, ok := r.raw(key)
	if !ok {
		r.errs = append(r.errs, fmt.Errorf("%s is not set", key))
	}
	return v
}

func (r *reader) str(key, fallback string) string {
	if v, ok := r.raw(key); ok {
		return v
	}
	return fallback
}

func (r *reader) boolean(key string, fallback bool) bool {
	v, ok := r.raw(key)
	if !ok {
		return fallback
	}
	switch strings.ToLower(v) {
	case "true":
		return true
	case "false":
		return false
	}
	r.errs = append(r.errs, fmt.Errorf("%s must be true or false", key))
	return fallback
}

// integer reads a whole number that is at least least.
func (r *reader) integer(key string, fallback, least int) int {
	v, ok := r.raw(key)
	if !ok {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < least {
		r.errs = append(r.errs, fmt.Errorf("%s must be a whole number of at least %d", key, least))
		return fallback
	}
	return n
}

// rng reads the three keys of a per-service setting: <prefix>_DEFAULT<suffix>,
// <prefix>_MIN<suffix> and <prefix>_MAX<suffix>.
func (r *reader) rng(prefix, suffix string, fallback Range, least int) Range {
	out := Range{
		Default: r.integer(prefix+"_DEFAULT"+suffix, fallback.Default, least),
		Min:     r.integer(prefix+"_MIN"+suffix, fallback.Min, least),
		Max:     r.integer(prefix+"_MAX"+suffix, fallback.Max, least),
	}
	if out.Min > out.Max || out.Default < out.Min || out.Default > out.Max {
		r.errs = append(r.errs, fmt.Errorf("%s_MIN%s, %s_DEFAULT%s and %s_MAX%s must be in that order",
			prefix, suffix, prefix, suffix, prefix, suffix))
	}
	return out
}

func load(lookup Lookup) (Config, []string, error) {
	r := &reader{lookup: lookup}

	cfg := Config{
		// FR-101, FR-102: the app does not start without them.
		AdminUsername: r.required("ADMIN_USERNAME"),
		AdminPassword: r.required("ADMIN_PASSWORD"),

		ListenAddr:   r.str("LISTEN_ADDR", ":8080"),
		DatabasePath: r.str("DATABASE_PATH", "./data/monitory.db"),

		RequireHTTPS:   r.boolean("REQUIRE_HTTPS", true),
		TrustProxy:     r.boolean("TRUST_PROXY", false),
		ClientIPHeader: r.str("CLIENT_IP_HEADER", "X-Forwarded-For"),

		SMTP: SMTP{
			Host:     r.str("SMTP_HOST", ""),
			Port:     r.integer("SMTP_PORT", 587, 1),
			TLS:      r.str("SMTP_TLS", "starttls"),
			Username: r.str("SMTP_USERNAME", ""),
			Password: r.str("SMTP_PASSWORD", ""),
			From:     r.str("SMTP_FROM", ""),
		},

		Limits: Limits{
			CheckInterval: r.rng("CHECK_INTERVAL", "_SECONDS", Range{Default: 60, Min: 30, Max: 86400}, 1),
			Timeout:       r.rng("TIMEOUT", "_SECONDS", Range{Default: 10, Min: 1, Max: 60}, 1),
			RetryCount:    r.rng("RETRY_COUNT", "", Range{Default: 2, Min: 0, Max: 5}, 0),
			RetryInterval: r.rng("RETRY_INTERVAL", "_SECONDS", Range{Default: 10, Min: 1, Max: 300}, 1),

			MaxRedirects:          r.integer("MAX_REDIRECTS", 3, 0),
			ServiceNameMaxLength:  r.integer("SERVICE_NAME_MAX_LENGTH", 100, 1),
			MaxServices:           r.integer("MAX_SERVICES", 50, 1),
			MaxTargetsPerService:  r.integer("MAX_TARGETS_PER_SERVICE", 5, 1),
			MaxJSONRules:          r.integer("MAX_JSON_RULES", 10, 0),
			ResponseBodyMaxBytes:  r.integer("RESPONSE_BODY_MAX_BYTES", 65536, 1),
			RequestURLMaxLength:   r.integer("REQUEST_URL_MAX_LENGTH", 2048, 1),
			RequestMaxQueryParams: r.integer("REQUEST_MAX_QUERY_PARAMS", 20, 0),
			RequestMaxHeaders:     r.integer("REQUEST_MAX_HEADERS", 20, 0),
			HeaderNameMaxLength:   r.integer("HEADER_NAME_MAX_LENGTH", 128, 1),
			HeaderValueMaxLength:  r.integer("HEADER_VALUE_MAX_LENGTH", 4096, 0),
			RequestBodyMaxBytes:   r.integer("REQUEST_BODY_MAX_BYTES", 65536, 0),
			APIRequestMaxBytes:    r.integer("API_REQUEST_MAX_BYTES", 1048576, 1),
			EmailMaxLength:        r.integer("EMAIL_MAX_LENGTH", 254, 1),
			WebhookURLMaxLength:   r.integer("WEBHOOK_URL_MAX_LENGTH", 2048, 1),

			PublicRateLimitPerMinute:          r.integer("PUBLIC_RATE_LIMIT_PER_MINUTE", 60, 1),
			AlertDeliveryRetries:              r.integer("ALERT_DELIVERY_RETRIES", 3, 0),
			AlertDeliveryRetryIntervalSeconds: r.integer("ALERT_DELIVERY_RETRY_INTERVAL_SECONDS", 30, 1),
			WebhookTimeoutSeconds:             r.integer("WEBHOOK_TIMEOUT_SECONDS", 10, 1),
		},
	}

	if !isHeaderName(cfg.ClientIPHeader) {
		r.errs = append(r.errs, errors.New("CLIENT_IP_HEADER must be a header name: letters, digits and hyphens only"))
	}
	switch cfg.SMTP.TLS {
	case "starttls", "tls", "none":
	default:
		r.errs = append(r.errs, errors.New("SMTP_TLS must be one of starttls, tls, none"))
	}
	if cfg.SMTP.Port > 65535 {
		r.errs = append(r.errs, errors.New("SMTP_PORT must be at most 65535"))
	}
	if cfg.SMTP.Host != "" && cfg.SMTP.From == "" {
		r.errs = append(r.errs, errors.New("SMTP_FROM must be set when SMTP_HOST is set"))
	}

	return cfg, r.keys, errors.Join(r.errs...)
}

// isHeaderName reports whether s is one or more letters, digits or hyphens.
func isHeaderName(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '-':
		default:
			return false
		}
	}
	return true
}
