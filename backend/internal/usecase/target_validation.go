package usecase

import (
	"net/mail"
	"strings"
	"unicode/utf8"

	"monitory/internal/domain"
)

const msgWebhookURL = "Enter a URL that starts with http:// or https://."

// ValidateTargetInput checks a notification target against the limits and returns every
// field error, in the order type, name, then the fields of its type. One field gets at
// most one error. It reads nothing but its arguments (FR-80 to FR-82, FR-87 to FR-89,
// FR-92, FR-110).
func ValidateTargetInput(in domain.TargetInput, limits domain.TargetLimits) []domain.FieldError {
	in = normalizeTargetInput(in)
	v := &fieldErrors{}

	switch domain.TargetType(in.Type) {
	case domain.TargetTypeEmail, domain.TargetTypeWebhook:
	default:
		if in.Type == "" {
			v.add("type", domain.FieldErrorRequired, "Choose a type.")
		} else {
			v.add("type", domain.FieldErrorInvalidValue, msgNotAllowed)
		}
		return v.list
	}

	if utf8.RuneCountInString(in.Name) > domain.TargetNameMaxLength {
		v.add("name", domain.FieldErrorTooLong, tooLongChars(domain.TargetNameMaxLength))
	}

	if domain.TargetType(in.Type) == domain.TargetTypeEmail {
		validateAddress(v, in.Address, limits)
	} else {
		validateWebhookURL(v, in.URL, limits)
		validateHeaderRows(v, "headers", "Enter a header name.", in.Headers, headerLimits{
			MaxRows:  limits.MaxHeaders,
			NameMax:  limits.HeaderNameMaxLength,
			ValueMax: limits.HeaderValueMaxLength,
		})
	}
	return v.list
}

// normalizeTargetInput trims the surrounding whitespace from the name, the address, the
// URL and every header name and value. It returns a copy; the input's list is not changed.
func normalizeTargetInput(in domain.TargetInput) domain.TargetInput {
	in.Name = strings.TrimSpace(in.Name)
	in.Address = strings.TrimSpace(in.Address)
	in.URL = strings.TrimSpace(in.URL)
	if in.Headers != nil {
		rows := make([]domain.NameValue, len(in.Headers))
		for i, h := range in.Headers {
			rows[i] = domain.NameValue{Name: strings.TrimSpace(h.Name), Value: strings.TrimSpace(h.Value)}
		}
		in.Headers = rows
	}
	return in
}

func validateAddress(v *fieldErrors, address string, limits domain.TargetLimits) {
	switch {
	case address == "":
		v.add("address", domain.FieldErrorRequired, "Enter an email address.")
	case utf8.RuneCountInString(address) > limits.EmailMaxLength:
		v.add("address", domain.FieldErrorTooLong, tooLongChars(limits.EmailMaxLength))
	case !validEmail(address):
		v.add("address", domain.FieldErrorInvalidFormat, "Enter a valid email address.")
	}
}

// validEmail reports whether net/mail accepts the text and the parsed address is the
// whole text, which rejects a display name, angle brackets, comments and lists.
func validEmail(address string) bool {
	parsed, err := mail.ParseAddress(address)
	return err == nil && parsed.Address == address
}

func validateWebhookURL(v *fieldErrors, url string, limits domain.TargetLimits) {
	switch {
	case url == "":
		v.add("url", domain.FieldErrorRequired, msgWebhookURL)
	case !hasScheme(url, "http://") && !hasScheme(url, "https://"):
		v.add("url", domain.FieldErrorInvalidFormat, msgWebhookURL)
	case utf8.RuneCountInString(url) > limits.WebhookURLMaxLength:
		v.add("url", domain.FieldErrorTooLong, tooLongChars(limits.WebhookURLMaxLength))
	}
}
