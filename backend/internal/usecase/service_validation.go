package usecase

import (
	"fmt"
	"strings"
	"unicode/utf8"

	"monitory/internal/domain"
)

// ServiceSettings are the four timing values in force: what the admin sent, or the
// configured default.
type ServiceSettings struct {
	CheckIntervalSeconds int
	TimeoutSeconds       int
	RetryCount           int
	RetryIntervalSeconds int
}

// httpMethods are the methods a check may use (FR-36), exact and upper case.
var httpMethods = []string{"GET", "HEAD", "POST", "PUT", "DELETE", "CONNECT", "OPTIONS", "TRACE", "PATCH"}

const (
	minPort          = 1
	maxPort          = 65535
	minCertDaysLeft  = 1
	msgRequiredRow   = "Required."
	msgNotAllowed    = "Not an allowed value."
	msgNeedsHTTPSURL = "Needs a URL that starts with https://."
)

// effectiveSettings returns the four timing values in force.
func effectiveSettings(in domain.ServiceInput, limits domain.ServiceLimits) ServiceSettings {
	pick := func(v *int, r domain.Range) int {
		if v == nil {
			return r.Default
		}
		return *v
	}
	return ServiceSettings{
		CheckIntervalSeconds: pick(in.CheckIntervalSeconds, limits.CheckInterval),
		TimeoutSeconds:       pick(in.TimeoutSeconds, limits.Timeout),
		RetryCount:           pick(in.RetryCount, limits.RetryCount),
		RetryIntervalSeconds: pick(in.RetryIntervalSeconds, limits.RetryInterval),
	}
}

// ValidateServiceInput checks the whole input against the limits and returns every
// field error, in the order the contract's callers see them: name, the check, the
// settings, then the messages. One field gets at most one error. It reads nothing but
// its arguments.
func ValidateServiceInput(in domain.ServiceInput, limits domain.ServiceLimits) []domain.FieldError {
	in = normalizeServiceInput(in)
	v := &fieldErrors{}
	validateName(v, in.Name, limits)
	validateCheck(v, in.Check, limits)
	validateSettings(v, in, limits)
	validateMessage(v, "unhealthy_message", in.UnhealthyMessage)
	validateMessage(v, "recovery_message", in.RecoveryMessage)
	return v.list
}

// normalizeServiceInput trims the surrounding whitespace from the fields that name or
// locate something: the service name, the URL, the host, the names of query
// parameters and headers, the values of headers, and JSON rule fields. Query values,
// the body and a rule's failing value are left as typed. It returns a copy; the input's lists are not changed.
func normalizeServiceInput(in domain.ServiceInput) domain.ServiceInput {
	in.Name = strings.TrimSpace(in.Name)
	in.Check.HTTP.URL = strings.TrimSpace(in.Check.HTTP.URL)
	in.Check.TCP.Host = strings.TrimSpace(in.Check.TCP.Host)
	in.Check.HTTP.QueryParams = trimNames(in.Check.HTTP.QueryParams)
	in.Check.HTTP.Headers = trimNames(in.Check.HTTP.Headers)
	for i := range in.Check.HTTP.Headers {
		in.Check.HTTP.Headers[i].Value = strings.TrimSpace(in.Check.HTTP.Headers[i].Value)
	}
	if rules := in.Check.HTTP.JSONRules; rules != nil {
		in.Check.HTTP.JSONRules = make([]domain.JSONRule, len(rules))
		for i, r := range rules {
			r.Field = strings.TrimSpace(r.Field)
			in.Check.HTTP.JSONRules[i] = r
		}
	}
	return in
}

func trimNames(rows []domain.NameValue) []domain.NameValue {
	if rows == nil {
		return nil
	}
	out := make([]domain.NameValue, len(rows))
	for i, r := range rows {
		r.Name = strings.TrimSpace(r.Name)
		out[i] = r
	}
	return out
}

type fieldErrors struct {
	list []domain.FieldError
}

// tooLongChars is the message of a text over its limit in characters.
func tooLongChars(limit int) string { return fmt.Sprintf("Use %d characters or fewer.", limit) }

func (f *fieldErrors) add(field string, code domain.FieldErrorCode, message string) {
	f.list = append(f.list, domain.FieldError{Field: field, Code: code, Message: message})
}

func validateName(v *fieldErrors, name string, limits domain.ServiceLimits) {
	switch {
	case name == "":
		v.add("name", domain.FieldErrorRequired, "Enter a name.")
	case utf8.RuneCountInString(name) > limits.ServiceNameMaxLength:
		v.add("name", domain.FieldErrorTooLong, tooLongChars(limits.ServiceNameMaxLength))
	}
}

func validateCheck(v *fieldErrors, check domain.CheckInput, limits domain.ServiceLimits) {
	switch domain.CheckType(check.Type) {
	case domain.CheckTypeHTTP:
		validateHTTPCheck(v, check.HTTP, limits)
	case domain.CheckTypeTCP:
		validateTCPCheck(v, check.TCP)
	default:
		if check.Type == "" {
			v.add("check.type", domain.FieldErrorRequired, "Choose a type.")
		} else {
			v.add("check.type", domain.FieldErrorInvalidValue, msgNotAllowed)
		}
	}
}

func validateTCPCheck(v *fieldErrors, check domain.TCPCheckInput) {
	if check.Host == "" {
		v.add("check.host", domain.FieldErrorRequired, "Enter a host.")
	}
	if check.Port < minPort || check.Port > maxPort {
		v.add("check.port", domain.FieldErrorOutOfRange, fmt.Sprintf("Must be between %d and %d.", minPort, maxPort))
	}
}

func validateHTTPCheck(v *fieldErrors, check domain.HTTPCheckInput, limits domain.ServiceLimits) {
	validateMethod(v, check.Method)
	validateURL(v, check, limits)
	validateQueryParams(v, check.QueryParams, limits)
	validateHeaders(v, check.Headers, limits)
	validateBody(v, check, limits)
	validateJSONRules(v, check, limits)

	https := hasHTTPSScheme(check.URL)
	if check.CertificateCheckEnabled {
		if !https {
			v.add("check.certificate_check.enabled", domain.FieldErrorRequiresHTTPSURL, msgNeedsHTTPSURL)
		}
		switch {
		case check.CertMinDaysLeft == nil:
			v.add("check.certificate_check.min_days_left", domain.FieldErrorRequired, "Enter a number of days.")
		case *check.CertMinDaysLeft < minCertDaysLeft:
			v.add("check.certificate_check.min_days_left", domain.FieldErrorOutOfRange, fmt.Sprintf("Must be %d or more.", minCertDaysLeft))
		}
	}
	if check.IgnoreCertificateErrors && !https {
		v.add("check.ignore_certificate_errors", domain.FieldErrorRequiresHTTPSURL, msgNeedsHTTPSURL)
	}
}

func validateMethod(v *fieldErrors, method string) {
	if method == "" {
		v.add("check.method", domain.FieldErrorRequired, "Choose a method.")
		return
	}
	for _, m := range httpMethods {
		if method == m {
			return
		}
	}
	v.add("check.method", domain.FieldErrorInvalidValue, msgNotAllowed)
}

// hasScheme reports whether url starts with scheme, ignoring the case of its letters.
func hasScheme(url, scheme string) bool {
	return len(url) >= len(scheme) && strings.EqualFold(url[:len(scheme)], scheme)
}

func hasHTTPSScheme(url string) bool { return hasScheme(url, "https://") }

func validateURL(v *fieldErrors, check domain.HTTPCheckInput, limits domain.ServiceLimits) {
	switch {
	case check.URL == "":
		v.add("check.url", domain.FieldErrorRequired, "Enter a URL.")
		return
	case !hasScheme(check.URL, "http://") && !hasScheme(check.URL, "https://"):
		v.add("check.url", domain.FieldErrorInvalidFormat, "Enter a URL that starts with http:// or https://.")
		return
	}
	// The length counts the query parameters as they will be joined, unencoded (FR-38).
	length := utf8.RuneCountInString(check.URL)
	for _, q := range check.QueryParams {
		length += 1 + utf8.RuneCountInString(q.Name) + 1 + utf8.RuneCountInString(q.Value)
	}
	if length > limits.RequestURLMaxLength {
		v.add("check.url", domain.FieldErrorTooLong,
			fmt.Sprintf("Use %d characters or fewer, query parameters included.", limits.RequestURLMaxLength))
	}
}

func validateQueryParams(v *fieldErrors, params []domain.NameValue, limits domain.ServiceLimits) {
	if len(params) > limits.RequestMaxQueryParams {
		v.add("check.query_params", domain.FieldErrorTooMany,
			fmt.Sprintf("Too many rows. Use %d or fewer.", limits.RequestMaxQueryParams))
	}
	for i, p := range params {
		if p.Name == "" {
			v.add(fmt.Sprintf("check.query_params[%d].name", i), domain.FieldErrorRequired, msgRequiredRow)
		}
	}
}

func validateHeaders(v *fieldErrors, headers []domain.NameValue, limits domain.ServiceLimits) {
	validateHeaderRows(v, "check.headers", msgRequiredRow, headers, headerLimits{
		MaxRows:  limits.RequestMaxHeaders,
		NameMax:  limits.HeaderNameMaxLength,
		ValueMax: limits.HeaderValueMaxLength,
	})
}

// headerLimits are the limits a list of header rows is held to, for a service's request
// and for a webhook target alike (FR-38, FR-92).
type headerLimits struct {
	MaxRows  int
	NameMax  int
	ValueMax int
}

// validateHeaderRows checks a list of headers. field is the path of the list, such as
// "check.headers", and emptyName the message for a row without a name.
func validateHeaderRows(v *fieldErrors, field, emptyName string, headers []domain.NameValue, limits headerLimits) {
	if len(headers) > limits.MaxRows {
		v.add(field, domain.FieldErrorTooMany, fmt.Sprintf("Too many rows. Use %d or fewer.", limits.MaxRows))
	}
	for i, h := range headers {
		switch {
		case h.Name == "":
			v.add(fmt.Sprintf("%s[%d].name", field, i), domain.FieldErrorRequired, emptyName)
		case utf8.RuneCountInString(h.Name) > limits.NameMax:
			v.add(fmt.Sprintf("%s[%d].name", field, i), domain.FieldErrorTooLong, tooLongChars(limits.NameMax))
		}
		if utf8.RuneCountInString(h.Value) > limits.ValueMax {
			v.add(fmt.Sprintf("%s[%d].value", field, i), domain.FieldErrorTooLong, tooLongChars(limits.ValueMax))
		}
	}
}

func validateBody(v *fieldErrors, check domain.HTTPCheckInput, limits domain.ServiceLimits) {
	switch domain.BodyType(check.BodyType) {
	case "", domain.BodyTypeNone, domain.BodyTypeJSON, domain.BodyTypeText, domain.BodyTypeForm:
	default:
		v.add("check.body.type", domain.FieldErrorInvalidValue, msgNotAllowed)
	}
	if len(check.BodyContent) > limits.RequestBodyMaxBytes {
		v.add("check.body.content", domain.FieldErrorTooLong,
			fmt.Sprintf("Use %d bytes or fewer.", limits.RequestBodyMaxBytes))
	}
}

func validateJSONRules(v *fieldErrors, check domain.HTTPCheckInput, limits domain.ServiceLimits) {
	if len(check.JSONRules) > limits.MaxJSONRules {
		v.add("check.json_rules", domain.FieldErrorTooMany,
			fmt.Sprintf("Too many rows. Use %d or fewer.", limits.MaxJSONRules))
	}
	for i, r := range check.JSONRules {
		if r.Field == "" {
			v.add(fmt.Sprintf("check.json_rules[%d].field", i), domain.FieldErrorRequired, msgRequiredRow)
		}
		if r.FailingValue == nil {
			v.add(fmt.Sprintf("check.json_rules[%d].failing_value", i), domain.FieldErrorRequired, msgRequiredRow)
		}
	}
	switch domain.JSONRuleMode(check.JSONRuleMode) {
	case "", domain.JSONRuleModeAny, domain.JSONRuleModeAll:
	default:
		v.add("check.json_rule_mode", domain.FieldErrorInvalidValue, msgNotAllowed)
	}
}

func validateSettings(v *fieldErrors, in domain.ServiceInput, limits domain.ServiceLimits) {
	s := effectiveSettings(in, limits)
	inRange := true
	check := func(field string, value int, r domain.Range, message string) {
		if value < r.Min || value > r.Max {
			inRange = false
			v.add(field, domain.FieldErrorOutOfRange, fmt.Sprintf(message, r.Min, r.Max))
		}
	}
	check("settings.check_interval_seconds", s.CheckIntervalSeconds, limits.CheckInterval, "The check interval is %d to %d seconds.")
	check("settings.timeout_seconds", s.TimeoutSeconds, limits.Timeout, "The timeout is %d to %d seconds.")
	check("settings.retry_count", s.RetryCount, limits.RetryCount, "The retry count is %d to %d.")
	check("settings.retry_interval_seconds", s.RetryIntervalSeconds, limits.RetryInterval, "The retry interval is %d to %d seconds.")
	if !inRange {
		return
	}

	// The longest a check can take must fit in the interval (FR-56).
	worst := s.TimeoutSeconds*(1+s.RetryCount) + s.RetryIntervalSeconds*s.RetryCount
	if worst > s.CheckIntervalSeconds {
		v.add("settings", domain.FieldErrorCheckBudgetExceeded, fmt.Sprintf(
			"The longest attempt takes %d seconds, longer than the check interval of %d seconds. Raise the interval, or lower the timeout, retries or retry interval.",
			worst, s.CheckIntervalSeconds))
	}
}

// trimmedMessage is a message as it is saved: without surrounding whitespace.
func trimmedMessage(message string) string { return strings.TrimSpace(message) }

func validateMessage(v *fieldErrors, field, message string) {
	if utf8.RuneCountInString(trimmedMessage(message)) > domain.MessageMaxLength {
		v.add(field, domain.FieldErrorTooLong, tooLongChars(domain.MessageMaxLength))
	}
}
