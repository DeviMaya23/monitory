package handler

import (
	"encoding/json"

	"monitory/internal/api"
	"monitory/internal/domain"
)

// toTargetInput decodes the target union, which the generated code leaves as raw JSON.
// A missing or null body, or one without a type, is an empty type for validation to
// reject; a body of the wrong shape is errMalformedRequest. Only the part that matches
// the type is read, so a header sent with an email target is dropped.
func toTargetInput(body api.TargetInput) (domain.TargetInput, error) {
	raw, err := body.MarshalJSON() // "null" when the body was missing
	if err != nil {
		return domain.TargetInput{}, errMalformedRequest
	}
	if isJSONNull(raw) {
		return domain.TargetInput{}, nil
	}

	var head struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &head); err != nil {
		return domain.TargetInput{}, errMalformedRequest
	}
	out := domain.TargetInput{Type: head.Type}

	switch domain.TargetType(head.Type) {
	case domain.TargetTypeEmail:
		var t api.EmailTargetInput
		if err := json.Unmarshal(raw, &t); err != nil {
			return domain.TargetInput{}, errMalformedRequest
		}
		out.Name, out.Address = deref(t.Name), t.Address
	case domain.TargetTypeWebhook:
		var t api.WebhookTargetInput
		if err := json.Unmarshal(raw, &t); err != nil {
			return domain.TargetInput{}, errMalformedRequest
		}
		out.Name, out.URL = deref(t.Name), t.Url
		if t.Headers != nil {
			for _, h := range *t.Headers {
				out.Headers = append(out.Headers, domain.NameValue{Name: h.Name, Value: h.Value})
			}
		}
	}
	return out, nil
}

// toAPITarget maps a stored target to the contract's Target. The name is always there,
// empty when none was given, and a webhook's headers are always there.
func toAPITarget(t domain.Target) (api.Target, error) {
	var out api.Target
	name := t.Name
	switch t.Type {
	case domain.TargetTypeWebhook:
		headers := make([]api.HttpHeader, len(t.Headers))
		for i, h := range t.Headers {
			headers[i] = api.HttpHeader{Name: h.Name, Value: h.Value}
		}
		err := out.FromWebhookTarget(api.WebhookTarget{
			Id: &t.ID, LastDeliveryFailed: &t.LastDeliveryFailed,
			Type: api.WebhookTargetTypeWebhook, Name: &name, Url: t.Value, Headers: &headers,
		})
		return out, err
	default:
		err := out.FromEmailTarget(api.EmailTarget{
			Id: &t.ID, LastDeliveryFailed: &t.LastDeliveryFailed,
			Type: api.EmailTargetTypeEmail, Name: &name, Address: t.Value,
		})
		return out, err
	}
}
