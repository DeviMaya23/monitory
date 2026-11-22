package handler_test

import (
	"bytes"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/testutil"
)

func postTargetTest(e *echo.Echo, serviceID, body string, opts ...requestOption) *http.Response {
	opts = append([]requestOption{withSession, withCSRF, withJSON}, opts...)
	return do(e, http.MethodPost, "/api/services/"+serviceID+"/target-tests", body, opts...)
}

func TestTestTarget_Email(t *testing.T) {
	spy := &testerSpy{result: domain.TargetTestResult{Delivered: true}}
	e := newRouter(t, routerOptions{tester: spy})

	res := postTargetTest(e, "s1", `{"type":"email","name":"Ops","address":"a@x.io"}`)

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "testTarget", res)
	assert.JSONEq(t, `{"delivered":true}`, readBody(t, res))
	assert.Equal(t, []string{"s1"}, spy.serviceIDs)
	assert.Equal(t, []domain.TargetInput{{Type: "email", Name: "Ops", Address: "a@x.io"}}, spy.inputs)
}

func TestTestTarget_WebhookHeaders(t *testing.T) {
	spy := &testerSpy{result: domain.TargetTestResult{Delivered: true}}
	e := newRouter(t, routerOptions{tester: spy})

	res := postTargetTest(e, "s1", `{"type":"webhook","url":"https://h/x","headers":[{"name":"B","value":"2"},{"name":"A","value":""}]}`)

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "testTarget", res)
	assert.Equal(t, []domain.TargetInput{{
		Type: "webhook", URL: "https://h/x",
		Headers: []domain.NameValue{{Name: "B", Value: "2"}, {Name: "A", Value: ""}},
	}}, spy.inputs)
}

func TestTestTarget_FailedDeliveryIs200WithTheReason(t *testing.T) {
	spy := &testerSpy{result: domain.TargetTestResult{FailureReason: "no SMTP account configured"}}
	e := newRouter(t, routerOptions{tester: spy})

	res := postTargetTest(e, "s1", `{"type":"email","address":"a@x.io"}`)

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "testTarget", res)
	assert.JSONEq(t, `{"delivered":false,"failure_reason":"no SMTP account configured"}`, readBody(t, res))
}

func TestTestTarget_FailedDeliveryWithACauseKeepsTheBodyShape(t *testing.T) {
	spy := &testerSpy{result: domain.TargetTestResult{
		FailureReason: "the SMTP server did not accept the message", FailureCause: "recipient refused",
	}}
	e := newRouter(t, routerOptions{tester: spy})

	res := postTargetTest(e, "s1", `{"type":"email","address":"a@x.io"}`)

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "testTarget", res)
	assert.Equal(t, `{"delivered":false,"failure_reason":"the SMTP server did not accept the message"}`, strings.TrimSpace(readBody(t, res)))
}

func TestTestTarget_Errors(t *testing.T) {
	fields := []domain.FieldError{
		{Field: "address", Code: domain.FieldErrorInvalidFormat, Message: "Enter a valid email address."},
		{Field: "name", Code: domain.FieldErrorTooLong, Message: "Use at most 50 characters."},
	}
	tests := []struct {
		name string
		err  error
		want int
		code string
	}{
		{"validation", domain.ValidationError{Fields: fields}, http.StatusUnprocessableEntity, "validation_failed"},
		{"not found", domain.ErrNotFound, http.StatusNotFound, "not_found"},
		{"other", errors.New("boom"), http.StatusInternalServerError, "internal_error"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			e := newRouter(t, routerOptions{tester: &testerSpy{err: tt.err}})

			res := postTargetTest(e, "s1", `{"type":"email","address":"x"}`)

			require.Equal(t, tt.want, res.StatusCode)
			testutil.AssertConforms(t, "testTarget", res)
			assert.Equal(t, tt.code, problemCode(t, res))
		})
	}

	t.Run("validation errors keep their order", func(t *testing.T) {
		e := newRouter(t, routerOptions{tester: &testerSpy{err: domain.ValidationError{Fields: fields}}})

		res := postTargetTest(e, "s1", `{"type":"email","address":"x"}`)

		assert.JSONEq(t, `{"title":"Validation failed","status":422,"code":"validation_failed","errors":[
			{"field":"address","code":"invalid_format","message":"Enter a valid email address."},
			{"field":"name","code":"too_long","message":"Use at most 50 characters."}]}`, readBody(t, res))
	})
}

func TestTestTarget_RouterRules(t *testing.T) {
	const body = `{"type":"email","address":"a@x.io"}`
	url := "/api/services/s1/target-tests"
	tests := []struct {
		name string
		res  func(e *echo.Echo) *http.Response
		want int
		code string
	}{
		{"no session", func(e *echo.Echo) *http.Response {
			return do(e, http.MethodPost, url, body, withCSRF, withJSON)
		}, http.StatusUnauthorized, "unauthenticated"},
		{"no CSRF token", func(e *echo.Echo) *http.Response {
			return do(e, http.MethodPost, url, body, withSession, withJSON)
		}, http.StatusForbidden, "csrf_failed"},
		{"body over the limit", func(e *echo.Echo) *http.Response {
			return postTargetTest(e, "s1", `{"type":"email","address":"`+strings.Repeat("a", 200)+`"}`)
		}, http.StatusRequestEntityTooLarge, "payload_too_large"},
		{"not JSON", func(e *echo.Echo) *http.Response {
			return do(e, http.MethodPost, url, body, withSession, withCSRF,
				func(r *http.Request) { r.Header.Set(echo.HeaderContentType, "text/plain") })
		}, http.StatusUnsupportedMediaType, "unsupported_media_type"},
		{"no body", func(e *echo.Echo) *http.Response {
			return do(e, http.MethodPost, url, "", withSession, withCSRF, withJSON)
		}, http.StatusBadRequest, "malformed_request"},
		{"wrong shape", func(e *echo.Echo) *http.Response {
			return postTargetTest(e, "s1", `{"type":"email","address":5}`)
		}, http.StatusBadRequest, "malformed_request"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spy := &testerSpy{result: domain.TargetTestResult{Delivered: true}}
			e := newRouter(t, routerOptions{tester: spy, maxRequestBytes: 100})

			res := tt.res(e)

			require.Equal(t, tt.want, res.StatusCode)
			testutil.AssertConforms(t, "testTarget", res)
			assert.Equal(t, tt.code, problemCode(t, res))
			assert.Empty(t, spy.inputs, "nothing is tested")
		})
	}
}

func TestTestTarget_LogsOutcomeWithoutSecrets(t *testing.T) {
	var logs bytes.Buffer
	const secretReason = "reason-text-secret"
	spy := &testerSpy{result: domain.TargetTestResult{FailureReason: secretReason}}
	e := newRouter(t, routerOptions{tester: spy, logOutput: &logs})

	res := postTargetTest(e, "svc-77", `{"type":"webhook","name":"Pager-secret","url":"https://hook.secret.test/p","headers":[{"name":"X-Token","value":"tok-secret"}]}`)
	require.Equal(t, http.StatusOK, res.StatusCode)
	res = postTargetTest(e, "svc-77", `{"type":"email","address":"addr-secret@x.io"}`)
	require.Equal(t, http.StatusOK, res.StatusCode)

	out := logs.String()
	assert.Equal(t, 2, strings.Count(out, "target test sent"))
	assert.Contains(t, out, "service_id=svc-77")
	assert.Contains(t, out, "type=webhook")
	assert.Contains(t, out, "type=email")
	assert.Contains(t, out, "delivered=false")
	for _, secret := range []string{"secret", "X-Token", "hook.", secretReason} {
		assert.NotContains(t, out, secret)
	}
}

func TestTestTarget_LogsTheCauseOnlyOnAFailure(t *testing.T) {
	tests := []struct {
		name      string
		result    domain.TargetTestResult
		wantCause string // empty: the line has no cause key
	}{
		{"a failure with a cause", domain.TargetTestResult{FailureReason: "reason-text-secret", FailureCause: "recipient refused"}, "recipient refused"},
		{"a failure with no cause", domain.TargetTestResult{FailureReason: "reason-text-secret"}, ""},
		{"a delivery", domain.TargetTestResult{Delivered: true, FailureCause: "recipient refused"}, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var logs bytes.Buffer
			e := newRouter(t, routerOptions{tester: &testerSpy{result: tt.result}, logOutput: &logs})

			res := postTargetTest(e, "svc-77", `{"type":"email","address":"addr-secret@x.io"}`)
			require.Equal(t, http.StatusOK, res.StatusCode)

			out := logs.String()
			require.Contains(t, out, "target test sent")
			if tt.wantCause == "" {
				assert.NotContains(t, out, "cause")
			} else {
				assert.Contains(t, out, `cause="recipient refused"`)
			}
			for _, secret := range []string{"addr-secret", "reason-text-secret"} {
				assert.NotContains(t, out, secret)
			}
		})
	}
}
