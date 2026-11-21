package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"time"

	"monitory/internal/api"
	"monitory/internal/domain"
)

// toServiceInput maps a request body to the domain input. A body that does not fit the
// contract's shape is errMalformedRequest. Values the contract types as enums stay
// plain strings, so that validation rejects them with a field error.
func toServiceInput(body api.ServiceInput) (domain.ServiceInput, error) {
	check, err := toCheckInput(body.Check)
	if err != nil {
		return domain.ServiceInput{}, err
	}
	input := domain.ServiceInput{
		Name:              body.Name,
		Check:             check,
		AlertsEnabled:     body.AlertsEnabled,
		ShownOnPublicView: body.ShownOnPublicView,
		UnhealthyMessage:  deref(body.UnhealthyMessage),
		RecoveryMessage:   deref(body.RecoveryMessage),
	}
	if body.Settings != nil {
		input.CheckIntervalSeconds = body.Settings.CheckIntervalSeconds
		input.TimeoutSeconds = body.Settings.TimeoutSeconds
		input.RetryCount = body.Settings.RetryCount
		input.RetryIntervalSeconds = body.Settings.RetryIntervalSeconds
	}
	return input, nil
}

// toCheckInput decodes the check union, which the generated code leaves as raw JSON. A
// missing or null check, or one without a type, is an empty type for validation to
// reject; a check of the wrong shape is errMalformedRequest.
func toCheckInput(check api.CheckConfig) (domain.CheckInput, error) {
	raw, err := check.MarshalJSON() // "null" when the check was missing
	if err != nil {
		return domain.CheckInput{}, errMalformedRequest
	}
	if isJSONNull(raw) {
		return domain.CheckInput{}, nil
	}

	var head struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &head); err != nil {
		return domain.CheckInput{}, errMalformedRequest
	}
	out := domain.CheckInput{Type: head.Type}

	switch domain.CheckType(head.Type) {
	case domain.CheckTypeHTTP:
		var c api.HttpCheck
		if err := json.Unmarshal(raw, &c); err != nil {
			return domain.CheckInput{}, errMalformedRequest
		}
		out.HTTP, err = toHTTPCheckInput(c)
		if err != nil {
			return domain.CheckInput{}, err
		}
	case domain.CheckTypeTCP:
		var c api.TcpCheck
		if err := json.Unmarshal(raw, &c); err != nil {
			return domain.CheckInput{}, errMalformedRequest
		}
		out.TCP = domain.TCPCheckInput{Host: c.Host, Port: c.Port}
	}
	return out, nil
}

func toHTTPCheckInput(c api.HttpCheck) (domain.HTTPCheckInput, error) {
	out := domain.HTTPCheckInput{
		Method:       string(c.Method),
		URL:          c.Url,
		JSONRuleMode: string(deref(c.JsonRuleMode)),
	}
	if c.QueryParams != nil {
		for _, q := range *c.QueryParams {
			out.QueryParams = append(out.QueryParams, domain.NameValue{Name: q.Name, Value: q.Value})
		}
	}
	if c.Headers != nil {
		for _, h := range *c.Headers {
			out.Headers = append(out.Headers, domain.NameValue{Name: h.Name, Value: h.Value})
		}
	}
	if c.Body != nil {
		out.BodyType = string(c.Body.Type)
		out.BodyContent = deref(c.Body.Content)
	}
	if c.JsonRules != nil {
		for _, r := range *c.JsonRules {
			value, err := failingValue(r.FailingValue)
			if err != nil {
				return domain.HTTPCheckInput{}, err
			}
			out.JSONRules = append(out.JSONRules, domain.JSONRule{Field: r.Field, FailingValue: value})
		}
	}
	if c.CertificateCheck != nil {
		out.CertificateCheckEnabled = c.CertificateCheck.Enabled
		out.CertMinDaysLeft = c.CertificateCheck.MinDaysLeft
	}
	out.IgnoreCertificateErrors = deref(c.IgnoreCertificateErrors)
	return out, nil
}

// failingValue reads a rule's value: a string or a bool is kept, a missing or null one
// is nil (validation says it is required), anything else is errMalformedRequest.
func failingValue(v api.JsonRule_FailingValue) (any, error) {
	raw, err := v.MarshalJSON()
	if err != nil {
		return nil, errMalformedRequest
	}
	if isJSONNull(raw) {
		return nil, nil
	}
	if s, err := v.AsJsonRuleFailingValue0(); err == nil {
		return s, nil
	}
	if b, err := v.AsJsonRuleFailingValue1(); err == nil {
		return b, nil
	}
	return nil, errMalformedRequest
}

func isJSONNull(raw []byte) bool {
	trimmed := bytes.TrimSpace(raw)
	return len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null"))
}

func deref[T any](p *T) T {
	var zero T
	if p == nil {
		return zero
	}
	return *p
}

// toAPIService maps a service with its state to the contract's Service. It fails only
// for a stored row that breaks the domain's own rules.
func toAPIService(view domain.ServiceView) (api.Service, error) {
	s := view.Service
	check, err := toAPICheck(s)
	if err != nil {
		return api.Service{}, err
	}
	return api.Service{
		Id:                  &s.ID,
		Name:                s.Name,
		Paused:              &s.Paused,
		TargetCount:         &view.TargetCount,
		AlertDeliveryFailed: &view.AlertDeliveryFailed,
		State:               toAPIState(view.State),
		Settings: &api.CheckSettings{
			CheckIntervalSeconds: &s.CheckIntervalSeconds,
			TimeoutSeconds:       &s.TimeoutSeconds,
			RetryCount:           &s.RetryCount,
			RetryIntervalSeconds: &s.RetryIntervalSeconds,
		},
		AlertsEnabled:     &s.AlertsEnabled,
		ShownOnPublicView: &s.ShownOnPublicView,
		UnhealthyMessage:  &s.UnhealthyMessage,
		RecoveryMessage:   &s.RecoveryMessage,
		Check:             check,
	}, nil
}

func toAPICheck(s domain.Service) (api.CheckConfig, error) {
	var out api.CheckConfig
	switch s.CheckType {
	case domain.CheckTypeTCP:
		err := out.FromTcpCheck(api.TcpCheck{Host: deref(s.TCPHost), Port: deref(s.TCPPort)})
		return out, err
	case domain.CheckTypeHTTP:
		queryParams := make([]api.QueryParam, len(s.HTTPQueryParams))
		for i, q := range s.HTTPQueryParams {
			queryParams[i] = api.QueryParam{Name: q.Name, Value: q.Value}
		}
		headers := make([]api.HttpHeader, len(s.HTTPHeaders))
		for i, h := range s.HTTPHeaders {
			headers[i] = api.HttpHeader{Name: h.Name, Value: h.Value}
		}
		rules := make([]api.JsonRule, len(s.JSONRules))
		for i, r := range s.JSONRules {
			rule := api.JsonRule{Field: r.Field}
			switch v := r.FailingValue.(type) {
			case string:
				if err := rule.FailingValue.FromJsonRuleFailingValue0(v); err != nil {
					return out, err
				}
			case bool:
				if err := rule.FailingValue.FromJsonRuleFailingValue1(v); err != nil {
					return out, err
				}
			default:
				return out, fmt.Errorf("json rule %d has a failing value of type %T", i, r.FailingValue)
			}
			rules[i] = rule
		}
		mode := api.HttpCheckJsonRuleMode(s.JSONRuleMode)
		cert := api.CertificateCheck{Enabled: s.CertCheck}
		if s.CertCheck {
			cert.MinDaysLeft = s.CertMinDaysLeft
		}
		err := out.FromHttpCheck(api.HttpCheck{
			Method:                  api.HttpCheckMethod(deref(s.HTTPMethod)),
			Url:                     deref(s.HTTPURL),
			QueryParams:             &queryParams,
			Headers:                 &headers,
			Body:                    &api.HttpBody{Type: api.HttpBodyType(s.HTTPBodyType), Content: &s.HTTPBodyContent},
			JsonRules:               &rules,
			JsonRuleMode:            &mode,
			CertificateCheck:        &cert,
			IgnoreCertificateErrors: &s.IgnoreCertErrs,
		})
		return out, err
	}
	return out, fmt.Errorf("unknown check type %q", s.CheckType)
}

func toAPIState(st domain.ServiceState) *api.ServiceState {
	out := &api.ServiceState{
		Status:             api.ServiceStateStatus(st.Status),
		LastCheckedAt:      utcOrNil(st.LastCheckedAt),
		LastStatusChangeAt: utcOrNil(st.LastStatusChangeAt),
	}
	// A reason is returned only for an unhealthy service that has a stored code.
	if st.Status == domain.StatusUnhealthy && st.FailureCode != nil {
		out.LastFailureReason = toAPIFailureReason(*st.FailureCode, st.FailureHTTPStatus, st.FailureJSONRuleField)
	}
	return out
}

// toAPIFailureReason maps a failure code to the contract's FailureReason: the status
// code only with non_2xx_status and the rule field only with json_rule_matched.
func toAPIFailureReason(code domain.FailureCode, httpStatus *int, ruleField *string) *api.FailureReason {
	reason := &api.FailureReason{Code: api.FailureReasonCode(code)}
	switch code {
	case domain.FailureNon2xxStatus:
		reason.HttpStatus = httpStatus
	case domain.FailureJSONRuleMatched:
		reason.JsonRuleField = ruleField
	}
	return reason
}

// toServiceTestInput maps a test request body to the domain input: the check, and the
// timeout when settings are given. The other settings play no part in a test.
func toServiceTestInput(body api.ServiceTestInput) (domain.ServiceTestInput, error) {
	check, err := toCheckInput(body.Check)
	if err != nil {
		return domain.ServiceTestInput{}, err
	}
	input := domain.ServiceTestInput{Check: check}
	if body.Settings != nil {
		input.TimeoutSeconds = body.Settings.TimeoutSeconds
	}
	return input, nil
}

// toAPIServiceTestResult maps a test result to the contract's ServiceTestResult. The
// status and the body are present together, only for a response that was received.
func toAPIServiceTestResult(r domain.ServiceTestResult) api.ServiceTestResult {
	truncated := r.BodyTruncated
	out := api.ServiceTestResult{
		Healthy:               r.Healthy,
		DurationMs:            r.DurationMs,
		ResponseBodyTruncated: &truncated,
	}
	if !r.Healthy && r.Failure != nil {
		out.FailureReason = toAPIFailureReason(r.Failure.Code, r.Failure.HTTPStatus, r.Failure.JSONRuleField)
	}
	if r.HTTPStatus != nil {
		status, body := *r.HTTPStatus, r.Body
		out.HttpStatus = &status
		out.ResponseBody = &body
	}
	return out
}

func utcOrNil(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}
