package usecase_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"

	"monitory/internal/domain"
	"monitory/internal/usecase"
)

// testTargetLimits are all different from the defaults, so a literal limit fails.
var testTargetLimits = domain.TargetLimits{
	MaxTargets:           3,
	EmailMaxLength:       30,
	WebhookURLMaxLength:  40,
	MaxHeaders:           3,
	HeaderNameMaxLength:  10,
	HeaderValueMaxLength: 20,
}

func validEmailTarget() domain.TargetInput {
	return domain.TargetInput{Type: "email", Address: "oncall@example.com"}
}

func validWebhookTarget() domain.TargetInput {
	return domain.TargetInput{Type: "webhook", URL: "https://example.com/hook"}
}

func validateTarget(in domain.TargetInput) []domain.FieldError {
	return usecase.ValidateTargetInput(in, testTargetLimits)
}

// padded returns text of exactly n characters ending in suffix.
func padded(n int, suffix string) string { return strings.Repeat("a", n-len(suffix)) + suffix }

func TestValidateTargetInput_Valid(t *testing.T) {
	hook := validWebhookTarget()
	hook.Name = "Pager"
	hook.Headers = []domain.NameValue{{Name: "X-Key", Value: "v"}, {Name: "X-Empty", Value: ""}}
	assert.Empty(t, validateTarget(validEmailTarget()))
	assert.Empty(t, validateTarget(hook))
}

func TestValidateTargetInput_Type(t *testing.T) {
	// Every other field is wrong too: none is reported with a bad type.
	bad := func(typ string) domain.TargetInput {
		return domain.TargetInput{Type: typ, Name: strings.Repeat("n", 99), Address: "x", URL: "x"}
	}
	assert.Equal(t, []domain.FieldError{fe("type", domain.FieldErrorRequired, "Choose a type.")}, validateTarget(bad("")))
	assert.Equal(t, []domain.FieldError{fe("type", domain.FieldErrorInvalidValue, "Not an allowed value.")}, validateTarget(bad("ftp")))
	assert.Equal(t, []domain.FieldError{fe("type", domain.FieldErrorInvalidValue, "Not an allowed value.")}, validateTarget(bad("Email")))
}

func TestValidateTargetInput_Name(t *testing.T) {
	tooLong := fe("name", domain.FieldErrorTooLong, "Use 50 characters or fewer.")
	for _, base := range []domain.TargetInput{validEmailTarget(), validWebhookTarget()} {
		in := base
		in.Name = strings.Repeat("n", 50)
		assert.Empty(t, validateTarget(in), "50 pass")
		in.Name = strings.Repeat("é", 50)
		assert.Empty(t, validateTarget(in), "50 multi-byte characters pass")
		in.Name = strings.Repeat("n", 51)
		assert.Equal(t, []domain.FieldError{tooLong}, validateTarget(in), "51 fail")
		in.Name = "  " + strings.Repeat("n", 50) + "  "
		assert.Empty(t, validateTarget(in), "the name is trimmed first")
		in.Name = ""
		assert.Empty(t, validateTarget(in), "empty passes")
	}
}

func TestValidateTargetInput_Address(t *testing.T) {
	invalid := fe("address", domain.FieldErrorInvalidFormat, "Enter a valid email address.")
	cases := []struct {
		name    string
		address string
		want    []domain.FieldError
	}{
		{"plain", "oncall@example.com", nil},
		{"mixed case", "Oncall@Example.COM", nil},
		{"no dot in the domain", "a@b", nil},
		{"surrounding spaces are removed", "  oncall@example.com \t", nil},
		{"empty", "", []domain.FieldError{fe("address", domain.FieldErrorRequired, "Enter an email address.")}},
		{"only spaces", "   ", []domain.FieldError{fe("address", domain.FieldErrorRequired, "Enter an email address.")}},
		{"no at sign", "oncall", []domain.FieldError{invalid}},
		{"no local part", "@example.com", []domain.FieldError{invalid}},
		{"no domain", "oncall@", []domain.FieldError{invalid}},
		{"a space inside", "a b@example.com", []domain.FieldError{invalid}},
		{"two at signs", "a@b@c", []domain.FieldError{invalid}},
		{"display name", "Name <a@example.com>", []domain.FieldError{invalid}},
		{"angle brackets", "<a@example.com>", []domain.FieldError{invalid}},
		{"comment", "a@example.com (work)", []domain.FieldError{invalid}},
		{"list", "a@example.com, b@example.com", []domain.FieldError{invalid}},
		{"exactly the limit", padded(30, "@x.io"), nil},
		{"one past the limit", padded(31, "@x.io"), []domain.FieldError{fe("address", domain.FieldErrorTooLong, "Use 30 characters or fewer.")}},
		{"too long and invalid is too long", strings.Repeat("a", 31), []domain.FieldError{fe("address", domain.FieldErrorTooLong, "Use 30 characters or fewer.")}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := domain.TargetInput{Type: "email", Address: tc.address}
			assert.Equal(t, tc.want, validateTarget(in))
		})
	}
}

func TestValidateTargetInput_URL(t *testing.T) {
	scheme := "Enter a URL that starts with http:// or https://."
	cases := []struct {
		name string
		url  string
		want []domain.FieldError
	}{
		{"http", "http://x", nil},
		{"https", "https://x", nil},
		{"upper case scheme", "HTTPS://x", nil},
		{"scheme only", "http://", nil},
		{"spaces are removed", "  https://x  ", nil},
		{"empty", "", []domain.FieldError{fe("url", domain.FieldErrorRequired, scheme)}},
		{"ftp", "ftp://x", []domain.FieldError{fe("url", domain.FieldErrorInvalidFormat, scheme)}},
		{"no scheme", "example.com", []domain.FieldError{fe("url", domain.FieldErrorInvalidFormat, scheme)}},
		{"httpx", "httpx://a", []domain.FieldError{fe("url", domain.FieldErrorInvalidFormat, scheme)}},
		{"exactly the limit", "https://" + strings.Repeat("a", 32), nil},
		{"one past the limit", "https://" + strings.Repeat("a", 33), []domain.FieldError{fe("url", domain.FieldErrorTooLong, "Use 40 characters or fewer.")}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, validateTarget(domain.TargetInput{Type: "webhook", URL: tc.url}))
		})
	}
}

func TestValidateTargetInput_Headers(t *testing.T) {
	rows := func(n int) []domain.NameValue {
		out := make([]domain.NameValue, n)
		for i := range out {
			out[i] = domain.NameValue{Name: fmt.Sprintf("H%d", i), Value: "v"}
		}
		return out
	}
	with := func(h []domain.NameValue) domain.TargetInput {
		in := validWebhookTarget()
		in.Headers = h
		return in
	}
	assert.Empty(t, validateTarget(with(rows(3))), "the configured row count passes")
	assert.Equal(t, []domain.FieldError{fe("headers", domain.FieldErrorTooMany, "Too many rows. Use 3 or fewer.")}, validateTarget(with(rows(4))))

	h := rows(2)
	h[1].Name = "  "
	assert.Equal(t, []domain.FieldError{fe("headers[1].name", domain.FieldErrorRequired, "Enter a header name.")}, validateTarget(with(h)))

	atLimit := []domain.NameValue{{Name: strings.Repeat("n", 10), Value: strings.Repeat("v", 20)}}
	assert.Empty(t, validateTarget(with(atLimit)))
	assert.Empty(t, validateTarget(with([]domain.NameValue{{Name: "n", Value: ""}})), "an empty value passes")

	pastLimit := []domain.NameValue{{Name: "ok", Value: "ok"}, {Name: strings.Repeat("n", 11), Value: strings.Repeat("v", 21)}}
	assert.Equal(t, []domain.FieldError{
		fe("headers[1].name", domain.FieldErrorTooLong, "Use 10 characters or fewer."),
		fe("headers[1].value", domain.FieldErrorTooLong, "Use 20 characters or fewer."),
	}, validateTarget(with(pastLimit)))

	t.Run("several errors come back together, in the order of the list", func(t *testing.T) {
		in := domain.TargetInput{
			Type: "webhook", Name: strings.Repeat("n", 51), URL: "ftp://x",
			Headers: []domain.NameValue{{Name: "", Value: ""}, {Name: "a", Value: strings.Repeat("v", 21)}, {Name: "b"}, {Name: "c"}},
		}
		assert.Equal(t, []domain.FieldError{
			fe("name", domain.FieldErrorTooLong, "Use 50 characters or fewer."),
			fe("url", domain.FieldErrorInvalidFormat, "Enter a URL that starts with http:// or https://."),
			fe("headers", domain.FieldErrorTooMany, "Too many rows. Use 3 or fewer."),
			fe("headers[0].name", domain.FieldErrorRequired, "Enter a header name."),
			fe("headers[1].value", domain.FieldErrorTooLong, "Use 20 characters or fewer."),
		}, validateTarget(in))
	})
}

func TestValidateTargetInput_EmailIgnoresHeaders(t *testing.T) {
	in := validEmailTarget()
	in.Headers = []domain.NameValue{{Name: "", Value: strings.Repeat("v", 99)}, {}, {}, {}, {}}
	assert.Empty(t, validateTarget(in))
}
