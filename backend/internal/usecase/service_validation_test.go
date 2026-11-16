package usecase_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/usecase"
)

// testLimits are all different from the defaults of the configuration, so a limit
// written as a literal in the code fails a test.
var testLimits = domain.ServiceLimits{
	CheckInterval:         domain.Range{Default: 90, Min: 30, Max: 300},
	Timeout:               domain.Range{Default: 7, Min: 2, Max: 20},
	RetryCount:            domain.Range{Default: 2, Min: 0, Max: 4},
	RetryInterval:         domain.Range{Default: 3, Min: 1, Max: 10},
	ServiceNameMaxLength:  10,
	MaxServices:           3,
	MaxJSONRules:          2,
	RequestURLMaxLength:   30,
	RequestMaxQueryParams: 2,
	RequestMaxHeaders:     2,
	HeaderNameMaxLength:   8,
	HeaderValueMaxLength:  12,
	RequestBodyMaxBytes:   16,
}

func ptr[T any](v T) *T { return &v }

func validHTTP() domain.ServiceInput {
	return domain.ServiceInput{
		Name:  "api",
		Check: domain.CheckInput{Type: "http", HTTP: domain.HTTPCheckInput{Method: "GET", URL: "https://x"}},
	}
}

func validTCP() domain.ServiceInput {
	return domain.ServiceInput{
		Name:  "db",
		Check: domain.CheckInput{Type: "tcp", TCP: domain.TCPCheckInput{Host: "db.local", Port: 5432}},
	}
}

func fe(field string, code domain.FieldErrorCode, message string) domain.FieldError {
	return domain.FieldError{Field: field, Code: code, Message: message}
}

func chars(n int) string { return strings.Repeat("a", n) }

// withHTTP returns a valid HTTP input changed by edit.
func withHTTP(edit func(*domain.HTTPCheckInput)) domain.ServiceInput {
	in := validHTTP()
	edit(&in.Check.HTTP)
	return in
}

func with(base domain.ServiceInput, edit func(*domain.ServiceInput)) domain.ServiceInput {
	edit(&base)
	return base
}

const (
	msgAllowed   = "Not an allowed value."
	msgRequired  = "Required."
	msgNeedHTTPS = "Needs a URL that starts with https://."
	msgBudget    = "The longest attempt takes %d seconds, longer than the check interval of %d seconds. Raise the interval, or lower the timeout, retries or retry interval."
)

func TestValidateServiceInput(t *testing.T) {
	url29 := "https://" + chars(21)                      // 29 characters: one under the limit
	urlLimit := "https://" + chars(22)                   // exactly the limit of 30
	multibyteName := strings.Repeat("é", 10)             // 20 bytes, 10 characters
	multibyteBody := strings.Repeat("é", 8)              // 16 bytes, 8 characters
	multibyteBodyOver := multibyteBody + "é"             // 18 bytes
	multibyteURL := "https://" + strings.Repeat("é", 22) // 30 characters, 52 bytes

	cases := []struct {
		name string
		in   domain.ServiceInput
		want []domain.FieldError
	}{
		// valid inputs
		{"valid minimal http", validHTTP(), nil},
		{"valid tcp", validTCP(), nil},

		// name
		{"name empty", with(validHTTP(), func(i *domain.ServiceInput) { i.Name = "" }),
			[]domain.FieldError{fe("name", domain.FieldErrorRequired, "Enter a name.")}},
		{"name whitespace only", with(validHTTP(), func(i *domain.ServiceInput) { i.Name = " \t " }),
			[]domain.FieldError{fe("name", domain.FieldErrorRequired, "Enter a name.")}},
		{"name at the limit", with(validHTTP(), func(i *domain.ServiceInput) { i.Name = chars(10) }), nil},
		{"name one past the limit", with(validHTTP(), func(i *domain.ServiceInput) { i.Name = chars(11) }),
			[]domain.FieldError{fe("name", domain.FieldErrorTooLong, "Use 10 characters or fewer.")}},
		{"name counts characters not bytes", with(validHTTP(), func(i *domain.ServiceInput) { i.Name = multibyteName }), nil},

		// check type
		{"type absent", with(validHTTP(), func(i *domain.ServiceInput) { i.Check = domain.CheckInput{} }),
			[]domain.FieldError{fe("check.type", domain.FieldErrorRequired, "Choose a type.")}},
		{"type ftp hides other check errors", with(validHTTP(), func(i *domain.ServiceInput) {
			i.Check = domain.CheckInput{Type: "ftp", HTTP: domain.HTTPCheckInput{Method: "bad"}, TCP: domain.TCPCheckInput{Port: 0}}
		}), []domain.FieldError{fe("check.type", domain.FieldErrorInvalidValue, msgAllowed)}},

		// method
		{"method empty", withHTTP(func(c *domain.HTTPCheckInput) { c.Method = "" }),
			[]domain.FieldError{fe("check.method", domain.FieldErrorRequired, "Choose a method.")}},
		{"method lower case", withHTTP(func(c *domain.HTTPCheckInput) { c.Method = "get" }),
			[]domain.FieldError{fe("check.method", domain.FieldErrorInvalidValue, msgAllowed)}},
		{"method FETCH", withHTTP(func(c *domain.HTTPCheckInput) { c.Method = "FETCH" }),
			[]domain.FieldError{fe("check.method", domain.FieldErrorInvalidValue, msgAllowed)}},

		// URL
		{"url empty", withHTTP(func(c *domain.HTTPCheckInput) { c.URL = "" }),
			[]domain.FieldError{fe("check.url", domain.FieldErrorRequired, "Enter a URL.")}},
		{"url ftp", withHTTP(func(c *domain.HTTPCheckInput) { c.URL = "ftp://x" }),
			[]domain.FieldError{fe("check.url", domain.FieldErrorInvalidFormat, "Enter a URL that starts with http:// or https://.")}},
		{"url without scheme", withHTTP(func(c *domain.HTTPCheckInput) { c.URL = "example.com" }),
			[]domain.FieldError{fe("check.url", domain.FieldErrorInvalidFormat, "Enter a URL that starts with http:// or https://.")}},
		{"url spaces only is required", withHTTP(func(c *domain.HTTPCheckInput) { c.URL = "   " }),
			[]domain.FieldError{fe("check.url", domain.FieldErrorRequired, "Enter a URL.")}},
		{"url with surrounding spaces passes", withHTTP(func(c *domain.HTTPCheckInput) { c.URL = "  https://x \t" }), nil},
		{"url length is counted after trimming", withHTTP(func(c *domain.HTTPCheckInput) { c.URL = " " + urlLimit + " " }), nil},
		{"query param name of spaces is required", withHTTP(func(c *domain.HTTPCheckInput) {
			c.QueryParams = []domain.NameValue{{Name: "  ", Value: "v"}}
		}), []domain.FieldError{fe("check.query_params[0].name", domain.FieldErrorRequired, msgRequired)}},
		{"header name of spaces is required", withHTTP(func(c *domain.HTTPCheckInput) {
			c.Headers = []domain.NameValue{{Name: " "}}
		}), []domain.FieldError{fe("check.headers[0].name", domain.FieldErrorRequired, msgRequired)}},
		{"header name length is counted after trimming", withHTTP(func(c *domain.HTTPCheckInput) {
			c.Headers = []domain.NameValue{{Name: " " + chars(8) + " "}}
		}), nil},
		{"json rule field of spaces is required", withHTTP(func(c *domain.HTTPCheckInput) {
			c.JSONRules = []domain.JSONRule{{Field: " ", FailingValue: "x"}}
		}), []domain.FieldError{fe("check.json_rules[0].field", domain.FieldErrorRequired, msgRequired)}},
		{"name length is counted after trimming", with(validHTTP(), func(i *domain.ServiceInput) { i.Name = " " + chars(10) + " " }), nil},
		{"url scheme upper case", withHTTP(func(c *domain.HTTPCheckInput) { c.URL = "HTTP://x" }), nil},
		{"url at the limit", withHTTP(func(c *domain.HTTPCheckInput) { c.URL = urlLimit }), nil},
		{"url one past the limit", withHTTP(func(c *domain.HTTPCheckInput) { c.URL = urlLimit + "a" }),
			[]domain.FieldError{fe("check.url", domain.FieldErrorTooLong, "Use 30 characters or fewer, query parameters included.")}},
		{"url plus a parameter reaches the limit", withHTTP(func(c *domain.HTTPCheckInput) {
			c.URL = url29[:len(url29)-3]                                // 26 characters
			c.QueryParams = []domain.NameValue{{Name: "a", Value: "b"}} // + "?a=b" = 4
		}), nil},
		{"url plus a parameter one past the limit", withHTTP(func(c *domain.HTTPCheckInput) {
			c.URL = url29[:len(url29)-2] // 27 characters
			c.QueryParams = []domain.NameValue{{Name: "a", Value: "b"}}
		}), []domain.FieldError{fe("check.url", domain.FieldErrorTooLong, "Use 30 characters or fewer, query parameters included.")}},
		{"url counts characters not bytes", withHTTP(func(c *domain.HTTPCheckInput) { c.URL = multibyteURL }), nil},

		// query parameters
		{"query params at the limit", withHTTP(func(c *domain.HTTPCheckInput) {
			c.QueryParams = []domain.NameValue{{Name: "a"}, {Name: "b"}}
		}), nil},
		{"query params one past the limit", withHTTP(func(c *domain.HTTPCheckInput) {
			c.QueryParams = []domain.NameValue{{Name: "a"}, {Name: "b"}, {Name: "c"}}
		}), []domain.FieldError{fe("check.query_params", domain.FieldErrorTooMany, "Too many rows. Use 2 or fewer.")}},
		{"query param with empty name has its index", withHTTP(func(c *domain.HTTPCheckInput) {
			c.QueryParams = []domain.NameValue{{Name: "a"}, {Name: "", Value: "v"}}
		}), []domain.FieldError{fe("check.query_params[1].name", domain.FieldErrorRequired, msgRequired)}},

		// headers
		{"headers at the limit", withHTTP(func(c *domain.HTTPCheckInput) {
			c.Headers = []domain.NameValue{{Name: "A"}, {Name: "B"}}
		}), nil},
		{"headers one past the limit", withHTTP(func(c *domain.HTTPCheckInput) {
			c.Headers = []domain.NameValue{{Name: "A"}, {Name: "B"}, {Name: "C"}}
		}), []domain.FieldError{fe("check.headers", domain.FieldErrorTooMany, "Too many rows. Use 2 or fewer.")}},
		{"header name empty", withHTTP(func(c *domain.HTTPCheckInput) {
			c.Headers = []domain.NameValue{{Name: "A"}, {Name: ""}}
		}), []domain.FieldError{fe("check.headers[1].name", domain.FieldErrorRequired, msgRequired)}},
		{"header name at the limit", withHTTP(func(c *domain.HTTPCheckInput) {
			c.Headers = []domain.NameValue{{Name: chars(8)}}
		}), nil},
		{"header name one past the limit", withHTTP(func(c *domain.HTTPCheckInput) {
			c.Headers = []domain.NameValue{{Name: chars(9)}}
		}), []domain.FieldError{fe("check.headers[0].name", domain.FieldErrorTooLong, "Use 8 characters or fewer.")}},
		{"header value at the limit", withHTTP(func(c *domain.HTTPCheckInput) {
			c.Headers = []domain.NameValue{{Name: "A", Value: chars(12)}}
		}), nil},
		{"header value one past the limit", withHTTP(func(c *domain.HTTPCheckInput) {
			c.Headers = []domain.NameValue{{Name: "A"}, {Name: "B", Value: chars(13)}}
		}), []domain.FieldError{fe("check.headers[1].value", domain.FieldErrorTooLong, "Use 12 characters or fewer.")}},
		{"header empty value", withHTTP(func(c *domain.HTTPCheckInput) {
			c.Headers = []domain.NameValue{{Name: "A", Value: ""}}
		}), nil},

		// body
		{"body type xml", withHTTP(func(c *domain.HTTPCheckInput) { c.BodyType = "xml" }),
			[]domain.FieldError{fe("check.body.type", domain.FieldErrorInvalidValue, msgAllowed)}},
		{"body json at the byte limit", withHTTP(func(c *domain.HTTPCheckInput) { c.BodyType = "json"; c.BodyContent = chars(16) }), nil},
		{"body one byte past the limit", withHTTP(func(c *domain.HTTPCheckInput) { c.BodyType = "text"; c.BodyContent = chars(17) }),
			[]domain.FieldError{fe("check.body.content", domain.FieldErrorTooLong, "Use 16 bytes or fewer.")}},
		{"body multi-byte at the byte limit", withHTTP(func(c *domain.HTTPCheckInput) { c.BodyType = "form"; c.BodyContent = multibyteBody }), nil},
		{"body multi-byte counts bytes", withHTTP(func(c *domain.HTTPCheckInput) { c.BodyType = "form"; c.BodyContent = multibyteBodyOver }),
			[]domain.FieldError{fe("check.body.content", domain.FieldErrorTooLong, "Use 16 bytes or fewer.")}},
		{"body over the limit with type none", withHTTP(func(c *domain.HTTPCheckInput) { c.BodyType = "none"; c.BodyContent = chars(17) }),
			[]domain.FieldError{fe("check.body.content", domain.FieldErrorTooLong, "Use 16 bytes or fewer.")}},
		{"body over the limit with type absent", withHTTP(func(c *domain.HTTPCheckInput) { c.BodyContent = chars(17) }),
			[]domain.FieldError{fe("check.body.content", domain.FieldErrorTooLong, "Use 16 bytes or fewer.")}},

		// JSON rules
		{"json rules at the limit with a string and a bool", withHTTP(func(c *domain.HTTPCheckInput) {
			c.JSONRules = []domain.JSONRule{{Field: "a", FailingValue: "down"}, {Field: "b", FailingValue: true}}
		}), nil},
		{"json rules one past the limit", withHTTP(func(c *domain.HTTPCheckInput) {
			c.JSONRules = []domain.JSONRule{{Field: "a", FailingValue: "x"}, {Field: "b", FailingValue: "x"}, {Field: "c", FailingValue: "x"}}
		}), []domain.FieldError{fe("check.json_rules", domain.FieldErrorTooMany, "Too many rows. Use 2 or fewer.")}},
		{"json rule empty field", withHTTP(func(c *domain.HTTPCheckInput) {
			c.JSONRules = []domain.JSONRule{{Field: "a", FailingValue: "x"}, {Field: "", FailingValue: "x"}}
		}), []domain.FieldError{fe("check.json_rules[1].field", domain.FieldErrorRequired, msgRequired)}},
		{"json rule absent failing value", withHTTP(func(c *domain.HTTPCheckInput) {
			c.JSONRules = []domain.JSONRule{{Field: "a"}}
		}), []domain.FieldError{fe("check.json_rules[0].failing_value", domain.FieldErrorRequired, msgRequired)}},
		{"json rule false failing value is present", withHTTP(func(c *domain.HTTPCheckInput) {
			c.JSONRules = []domain.JSONRule{{Field: "a", FailingValue: false}}
		}), nil},
		{"json rule mode none", withHTTP(func(c *domain.HTTPCheckInput) { c.JSONRuleMode = "none" }),
			[]domain.FieldError{fe("check.json_rule_mode", domain.FieldErrorInvalidValue, msgAllowed)}},
		{"json rule mode all", withHTTP(func(c *domain.HTTPCheckInput) { c.JSONRuleMode = "all" }), nil},

		// certificate options
		{"certificate check with http url", withHTTP(func(c *domain.HTTPCheckInput) {
			c.URL = "http://x"
			c.CertificateCheckEnabled, c.CertMinDaysLeft = true, ptr(5)
		}), []domain.FieldError{fe("check.certificate_check.enabled", domain.FieldErrorRequiresHTTPSURL, msgNeedHTTPS)}},
		{"certificate check with an invalid url", withHTTP(func(c *domain.HTTPCheckInput) {
			c.URL = "ftp://x"
			c.CertificateCheckEnabled, c.CertMinDaysLeft = true, ptr(5)
		}), []domain.FieldError{
			fe("check.url", domain.FieldErrorInvalidFormat, "Enter a URL that starts with http:// or https://."),
			fe("check.certificate_check.enabled", domain.FieldErrorRequiresHTTPSURL, msgNeedHTTPS)}},
		{"certificate check with an empty url", withHTTP(func(c *domain.HTTPCheckInput) {
			c.URL = ""
			c.CertificateCheckEnabled, c.CertMinDaysLeft = true, ptr(5)
		}), []domain.FieldError{
			fe("check.url", domain.FieldErrorRequired, "Enter a URL."),
			fe("check.certificate_check.enabled", domain.FieldErrorRequiresHTTPSURL, msgNeedHTTPS)}},
		{"certificate check without a minimum", withHTTP(func(c *domain.HTTPCheckInput) { c.CertificateCheckEnabled = true }),
			[]domain.FieldError{fe("check.certificate_check.min_days_left", domain.FieldErrorRequired, "Enter a number of days.")}},
		{"certificate minimum 0", withHTTP(func(c *domain.HTTPCheckInput) {
			c.CertificateCheckEnabled, c.CertMinDaysLeft = true, ptr(0)
		}), []domain.FieldError{fe("check.certificate_check.min_days_left", domain.FieldErrorOutOfRange, "Must be 1 or more.")}},
		{"certificate minimum 1", withHTTP(func(c *domain.HTTPCheckInput) {
			c.CertificateCheckEnabled, c.CertMinDaysLeft = true, ptr(1)
		}), nil},
		{"certificate disabled ignores the minimum", withHTTP(func(c *domain.HTTPCheckInput) { c.CertMinDaysLeft = ptr(0) }), nil},
		{"ignore certificate errors with http url", withHTTP(func(c *domain.HTTPCheckInput) {
			c.URL, c.IgnoreCertificateErrors = "http://x", true
		}), []domain.FieldError{fe("check.ignore_certificate_errors", domain.FieldErrorRequiresHTTPSURL, msgNeedHTTPS)}},
		{"ignore certificate errors with https url", withHTTP(func(c *domain.HTTPCheckInput) { c.IgnoreCertificateErrors = true }), nil},

		// TCP
		{"tcp empty host", with(validTCP(), func(i *domain.ServiceInput) { i.Check.TCP.Host = "" }),
			[]domain.FieldError{fe("check.host", domain.FieldErrorRequired, "Enter a host.")}},
		{"tcp host of spaces is required", with(validTCP(), func(i *domain.ServiceInput) { i.Check.TCP.Host = "  " }),
			[]domain.FieldError{fe("check.host", domain.FieldErrorRequired, "Enter a host.")}},
		{"tcp port 0 or absent", with(validTCP(), func(i *domain.ServiceInput) { i.Check.TCP.Port = 0 }),
			[]domain.FieldError{fe("check.port", domain.FieldErrorOutOfRange, "Must be between 1 and 65535.")}},
		{"tcp port 65536", with(validTCP(), func(i *domain.ServiceInput) { i.Check.TCP.Port = 65536 }),
			[]domain.FieldError{fe("check.port", domain.FieldErrorOutOfRange, "Must be between 1 and 65535.")}},
		{"tcp port 1", with(validTCP(), func(i *domain.ServiceInput) { i.Check.TCP.Port = 1 }), nil},
		{"tcp port 65535", with(validTCP(), func(i *domain.ServiceInput) { i.Check.TCP.Port = 65535 }), nil},

		// messages
		{"messages at the limit", with(validHTTP(), func(i *domain.ServiceInput) {
			i.UnhealthyMessage, i.RecoveryMessage = chars(500), chars(500)
		}), nil},
		{"messages one past the limit", with(validHTTP(), func(i *domain.ServiceInput) {
			i.UnhealthyMessage, i.RecoveryMessage = chars(501), chars(501)
		}), []domain.FieldError{
			fe("unhealthy_message", domain.FieldErrorTooLong, "Use 500 characters or fewer."),
			fe("recovery_message", domain.FieldErrorTooLong, "Use 500 characters or fewer.")}},
		{"messages are trimmed before the count", with(validHTTP(), func(i *domain.ServiceInput) {
			i.UnhealthyMessage, i.RecoveryMessage = "  "+chars(500)+" \n", "\t"+chars(500)
		}), nil},
		{"messages count characters", with(validHTTP(), func(i *domain.ServiceInput) {
			i.UnhealthyMessage = strings.Repeat("é", 500)
		}), nil},

		// several problems at once, in the contract's order, each field once
		{"everything wrong at once", domain.ServiceInput{
			Name:                 "",
			Check:                domain.CheckInput{Type: "http", HTTP: domain.HTTPCheckInput{Method: "x", URL: "nope", Headers: []domain.NameValue{{Name: ""}}, BodyType: "xml", JSONRuleMode: "none", IgnoreCertificateErrors: true}},
			CheckIntervalSeconds: ptr(1),
			UnhealthyMessage:     chars(501),
			RecoveryMessage:      chars(501),
		}, []domain.FieldError{
			fe("name", domain.FieldErrorRequired, "Enter a name."),
			fe("check.method", domain.FieldErrorInvalidValue, msgAllowed),
			fe("check.url", domain.FieldErrorInvalidFormat, "Enter a URL that starts with http:// or https://."),
			fe("check.headers[0].name", domain.FieldErrorRequired, msgRequired),
			fe("check.body.type", domain.FieldErrorInvalidValue, msgAllowed),
			fe("check.json_rule_mode", domain.FieldErrorInvalidValue, msgAllowed),
			fe("check.ignore_certificate_errors", domain.FieldErrorRequiresHTTPSURL, msgNeedHTTPS),
			fe("settings.check_interval_seconds", domain.FieldErrorOutOfRange, "The check interval is 30 to 300 seconds."),
			fe("unhealthy_message", domain.FieldErrorTooLong, "Use 500 characters or fewer."),
			fe("recovery_message", domain.FieldErrorTooLong, "Use 500 characters or fewer."),
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, usecase.ValidateServiceInput(tc.in, testLimits))
		})
	}
}

func TestValidateServiceInput_Settings(t *testing.T) {
	settingCases := []struct {
		field         string
		set           func(*domain.ServiceInput, int)
		min, max      int
		messageFormat string
	}{
		{"settings.check_interval_seconds", func(i *domain.ServiceInput, v int) { i.CheckIntervalSeconds = &v }, 30, 300, "The check interval is %d to %d seconds."},
		{"settings.timeout_seconds", func(i *domain.ServiceInput, v int) { i.TimeoutSeconds = &v }, 2, 20, "The timeout is %d to %d seconds."},
		{"settings.retry_count", func(i *domain.ServiceInput, v int) { i.RetryCount = &v }, 0, 4, "The retry count is %d to %d."},
		{"settings.retry_interval_seconds", func(i *domain.ServiceInput, v int) { i.RetryIntervalSeconds = &v }, 1, 10, "The retry interval is %d to %d seconds."},
	}
	for _, tc := range settingCases {
		t.Run(tc.field, func(t *testing.T) {
			want := []domain.FieldError{fe(tc.field, domain.FieldErrorOutOfRange, fmt.Sprintf(tc.messageFormat, tc.min, tc.max))}
			for _, v := range []int{tc.min - 1, tc.max + 1} {
				in := validHTTP()
				tc.set(&in, v)
				assert.Equal(t, want, usecase.ValidateServiceInput(in, testLimits), "value %d", v)
			}
			// At both limits the value passes. The interval is raised so the budget holds.
			for _, v := range []int{tc.min, tc.max} {
				in := validHTTP()
				in.CheckIntervalSeconds = ptr(300)
				tc.set(&in, v)
				if tc.field == "settings.check_interval_seconds" {
					assert.Empty(t, usecase.ValidateServiceInput(in, testLimits), "value %d", v)
				} else {
					in.TimeoutSeconds = ptr(2)
					in.RetryCount = ptr(1)
					in.RetryIntervalSeconds = ptr(1)
					tc.set(&in, v)
					assert.Empty(t, usecase.ValidateServiceInput(in, testLimits), "value %d", v)
				}
			}
		})
	}
}

func TestValidateServiceInput_Budget(t *testing.T) {
	// timeout 10 × (1 + 2) + retry interval 5 × 2 = 40.
	budget := func(interval, timeout, retries, retryInterval int) domain.ServiceInput {
		in := validHTTP()
		in.CheckIntervalSeconds, in.TimeoutSeconds, in.RetryCount, in.RetryIntervalSeconds =
			&interval, &timeout, &retries, &retryInterval
		return in
	}

	t.Run("equal to the interval passes", func(t *testing.T) {
		assert.Empty(t, usecase.ValidateServiceInput(budget(40, 10, 2, 5), testLimits))
	})
	t.Run("one second over is rejected with the computed values", func(t *testing.T) {
		assert.Equal(t,
			[]domain.FieldError{fe("settings", domain.FieldErrorCheckBudgetExceeded, fmt.Sprintf(msgBudget, 40, 39))},
			usecase.ValidateServiceInput(budget(39, 10, 2, 5), testLimits))
	})
	t.Run("with no retries the retry interval does not count", func(t *testing.T) {
		limits := testLimits
		limits.CheckInterval = domain.Range{Default: 90, Min: 5, Max: 300} // so a short interval is allowed
		assert.Empty(t, usecase.ValidateServiceInput(budget(20, 20, 0, 10), limits))
		assert.Equal(t,
			[]domain.FieldError{fe("settings", domain.FieldErrorCheckBudgetExceeded, fmt.Sprintf(msgBudget, 20, 19))},
			usecase.ValidateServiceInput(budget(19, 20, 0, 10), limits))
	})
	t.Run("defaults are checked too", func(t *testing.T) {
		in := validHTTP()
		in.CheckIntervalSeconds = ptr(30) // default timeout 7 × 3 + 3 × 2 = 27 fits
		assert.Empty(t, usecase.ValidateServiceInput(in, testLimits))
		in.TimeoutSeconds = ptr(8) // 8 × 3 + 6 = 30 fits exactly
		assert.Empty(t, usecase.ValidateServiceInput(in, testLimits))
		in.TimeoutSeconds = ptr(9) // 33
		assert.Equal(t,
			[]domain.FieldError{fe("settings", domain.FieldErrorCheckBudgetExceeded, fmt.Sprintf(msgBudget, 33, 30))},
			usecase.ValidateServiceInput(in, testLimits))
	})
	t.Run("no budget error when a value is out of range", func(t *testing.T) {
		// 25 × 3 would break the budget, but the timeout is out of range and says so alone.
		got := usecase.ValidateServiceInput(budget(60, 25, 2, 5), testLimits)
		assert.Equal(t,
			[]domain.FieldError{fe("settings.timeout_seconds", domain.FieldErrorOutOfRange, "The timeout is 2 to 20 seconds.")},
			got)
	})
}

func TestCreateService_AbsentSettingsTakeTheConfiguredDefaults(t *testing.T) {
	s := newServiceSetup()

	view, err := s.svc.CreateService(t.Context(), validHTTP())

	require.NoError(t, err)
	assert.Equal(t, 90, view.Service.CheckIntervalSeconds)
	assert.Equal(t, 7, view.Service.TimeoutSeconds)
	assert.Equal(t, 2, view.Service.RetryCount)
	assert.Equal(t, 3, view.Service.RetryIntervalSeconds)
}
