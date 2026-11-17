package handler_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
)

// targetSentToSpy posts body to createTarget and returns the one input that reached the usecase.
func targetSentToSpy(t *testing.T, body string) domain.TargetInput {
	t.Helper()
	spy := &targetSpy{target: emailRow("t1", "a@x.io")}
	e := newRouter(t, routerOptions{targets: spy})

	res := postTarget(e, "s1", body)

	require.Equal(t, http.StatusCreated, res.StatusCode, "body: %s", body)
	require.Len(t, spy.inputs, 1, "body: %s", body)
	return spy.inputs[0]
}

func TestToTargetInput(t *testing.T) {
	t.Run("a webhook with headers", func(t *testing.T) {
		got := targetSentToSpy(t, `{"type":"webhook","name":"Pager","url":"https://h","headers":[{"name":"K","value":"v"},{"name":"E","value":""}]}`)
		assert.Equal(t, domain.TargetInput{
			Type: "webhook", Name: "Pager", URL: "https://h",
			Headers: []domain.NameValue{{Name: "K", Value: "v"}, {Name: "E", Value: ""}},
		}, got)
	})
	t.Run("an email", func(t *testing.T) {
		got := targetSentToSpy(t, `{"type":"email","name":"Me","address":"a@x.io"}`)
		assert.Equal(t, domain.TargetInput{Type: "email", Name: "Me", Address: "a@x.io"}, got)
	})
	t.Run("a missing name is empty and missing headers are none", func(t *testing.T) {
		got := targetSentToSpy(t, `{"type":"webhook","url":"https://h"}`)
		assert.Equal(t, "", got.Name)
		assert.Empty(t, got.Headers)
	})
	t.Run("a header sent with an email target is dropped", func(t *testing.T) {
		got := targetSentToSpy(t, `{"type":"email","address":"a@x.io","headers":[{"name":"K","value":"v"}],"url":"https://h"}`)
		assert.Equal(t, domain.TargetInput{Type: "email", Address: "a@x.io"}, got)
	})
	t.Run("a missing, null or unknown type reaches validation as given", func(t *testing.T) {
		assert.Equal(t, "", targetSentToSpy(t, `{}`).Type)
		assert.Equal(t, "", targetSentToSpy(t, `{"type":null,"address":"a@x.io"}`).Type)
		assert.Equal(t, "ftp", targetSentToSpy(t, `{"type":"ftp"}`).Type)
	})
}

func TestToAPITarget(t *testing.T) {
	hook := domain.Target{
		ID: "t2", ServiceID: "s1", Name: "Pager", Type: domain.TargetTypeWebhook, Value: "https://h",
		Headers: []domain.NameValue{{Name: "K", Value: "v"}, {Name: "E", Value: ""}}, LastDeliveryFailed: true,
	}
	bare := domain.Target{ID: "t3", ServiceID: "s1", Type: domain.TargetTypeWebhook, Value: "https://b"} // nil headers, no name
	mail := emailRow("t1", "a@x.io")
	mail.Name = ""
	e := newRouter(t, routerOptions{targets: &targetSpy{targets: []domain.Target{mail, hook, bare}}})

	res := getTargets(e, "s1")

	require.Equal(t, http.StatusOK, res.StatusCode)
	assert.JSONEq(t, `[
		{"id":"t1","type":"email","name":"","address":"a@x.io","last_delivery_failed":false},
		{"id":"t2","type":"webhook","name":"Pager","url":"https://h","headers":[{"name":"K","value":"v"},{"name":"E","value":""}],"last_delivery_failed":true},
		{"id":"t3","type":"webhook","name":"","url":"https://b","headers":[],"last_delivery_failed":false}]`,
		readBody(t, res))
}
