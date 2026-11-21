package handler_test

import (
	"bytes"
	"encoding/json"
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

const serviceTestURL = "/api/service-tests"

const tcpTestBody = `{"check":{"type":"tcp","host":"h","port":80}}`
const httpTestBody = `{"check":{"type":"http","method":"GET","url":"https://x"}}`

func postServiceTest(e *echo.Echo, body string, opts ...requestOption) *http.Response {
	opts = append([]requestOption{withSession, withCSRF, withJSON}, opts...)
	return do(e, http.MethodPost, serviceTestURL, body, opts...)
}

func checkRouter(t *testing.T, spy *checkTesterSpy) *echo.Echo {
	t.Helper()
	return newRouter(t, routerOptions{checkTester: spy})
}

func TestTestServiceCheck_Healthy(t *testing.T) {
	spy := &checkTesterSpy{result: domain.ServiceTestResult{Healthy: true, DurationMs: 87, HTTPStatus: ptr(200), Body: "ok body"}}

	res := postServiceTest(checkRouter(t, spy), httpTestBody)

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "testServiceCheck", res)
	assert.JSONEq(t, `{"healthy":true,"duration_ms":87,"http_status":200,"response_body":"ok body","response_body_truncated":false}`, readBody(t, res))
}

func TestTestServiceCheck_Failed(t *testing.T) {
	tests := []struct {
		name   string
		result domain.ServiceTestResult
		want   string
	}{
		{"non-2xx has the status in the reason and on top", domain.ServiceTestResult{
			DurationMs: 12, Failure: &domain.CheckFailure{Code: domain.FailureNon2xxStatus, HTTPStatus: ptr(503)},
			HTTPStatus: ptr(503), Body: "down", BodyTruncated: true,
		}, `{"healthy":false,"duration_ms":12,"failure_reason":{"code":"non_2xx_status","http_status":503},"http_status":503,"response_body":"down","response_body_truncated":true}`},
		{"rule match has the field", domain.ServiceTestResult{
			DurationMs: 3, Failure: &domain.CheckFailure{Code: domain.FailureJSONRuleMatched, JSONRuleField: ptr("a.b"), HTTPStatus: ptr(200)},
			HTTPStatus: ptr(200), Body: `{"a":{"b":1}}`,
		}, `{"healthy":false,"duration_ms":3,"failure_reason":{"code":"json_rule_matched","json_rule_field":"a.b"},"http_status":200,"response_body":"{\"a\":{\"b\":1}}","response_body_truncated":false}`},
		{"a certificate problem carries nothing else", domain.ServiceTestResult{
			DurationMs: 5, Failure: &domain.CheckFailure{Code: domain.FailureCertificateProblem, HTTPStatus: ptr(200), JSONRuleField: ptr("f")},
			HTTPStatus: ptr(200), Body: "b",
		}, `{"healthy":false,"duration_ms":5,"failure_reason":{"code":"certificate_problem"},"http_status":200,"response_body":"b","response_body_truncated":false}`},
		{"no response", domain.ServiceTestResult{
			DurationMs: 2001, Failure: &domain.CheckFailure{Code: domain.FailureTimedOut},
		}, `{"healthy":false,"duration_ms":2001,"failure_reason":{"code":"timed_out"},"response_body_truncated":false}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := postServiceTest(checkRouter(t, &checkTesterSpy{result: tt.result}), httpTestBody)

			require.Equal(t, http.StatusOK, res.StatusCode)
			testutil.AssertConforms(t, "testServiceCheck", res)
			assert.JSONEq(t, tt.want, readBody(t, res))
		})
	}
}

func TestTestServiceCheck_TCPResultHasNoStatusOrBody(t *testing.T) {
	spy := &checkTesterSpy{result: domain.ServiceTestResult{Healthy: true, DurationMs: 4}}

	res := postServiceTest(checkRouter(t, spy), tcpTestBody)

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "testServiceCheck", res)
	assert.JSONEq(t, `{"healthy":true,"duration_ms":4,"response_body_truncated":false}`, readBody(t, res))
}

func TestTestServiceCheck_EmptyBodyWithAStatus(t *testing.T) {
	spy := &checkTesterSpy{result: domain.ServiceTestResult{Healthy: true, HTTPStatus: ptr(204)}}

	res := postServiceTest(checkRouter(t, spy), httpTestBody)

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "testServiceCheck", res)
	assert.JSONEq(t, `{"healthy":true,"duration_ms":0,"http_status":204,"response_body":"","response_body_truncated":false}`, readBody(t, res))
}

func TestTestServiceCheck_BodyIsReturnedAsText(t *testing.T) {
	const page = `<script>alert("x")</script><h1>Hi</h1> & </body> "quoted" \ é`
	spy := &checkTesterSpy{result: domain.ServiceTestResult{Healthy: true, HTTPStatus: ptr(200), Body: page}}

	res := postServiceTest(checkRouter(t, spy), httpTestBody)

	require.Equal(t, http.StatusOK, res.StatusCode)
	assert.Equal(t, "application/json", strings.Split(res.Header.Get(echo.HeaderContentType), ";")[0])
	var got struct {
		ResponseBody string `json:"response_body"`
	}
	require.NoError(t, json.Unmarshal([]byte(readBody(t, res)), &got))
	assert.Equal(t, page, got.ResponseBody)
}

func TestTestServiceCheck_Errors(t *testing.T) {
	t.Run("a validation error is 422 with every field", func(t *testing.T) {
		spy := &checkTesterSpy{err: domain.ValidationError{Fields: []domain.FieldError{
			{Field: "check.url", Code: domain.FieldErrorRequired, Message: "Enter a URL."},
			{Field: "settings.timeout_seconds", Code: domain.FieldErrorOutOfRange, Message: "The timeout is 2 to 20 seconds."},
		}}}

		res := postServiceTest(checkRouter(t, spy), httpTestBody)

		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode)
		testutil.AssertConforms(t, "testServiceCheck", res)
		assert.JSONEq(t, `{"title":"Validation failed","status":422,"code":"validation_failed","errors":[
			{"field":"check.url","code":"required","message":"Enter a URL."},
			{"field":"settings.timeout_seconds","code":"out_of_range","message":"The timeout is 2 to 20 seconds."}]}`, readBody(t, res))
	})
	t.Run("an unexpected error is 500 with its text hidden", func(t *testing.T) {
		spy := &checkTesterSpy{err: errors.New("run the check test: dial secret.internal")}

		res := postServiceTest(checkRouter(t, spy), httpTestBody)

		require.Equal(t, http.StatusInternalServerError, res.StatusCode)
		testutil.AssertConforms(t, "testServiceCheck", res)
		body := readBody(t, res)
		assert.Contains(t, body, "internal_error")
		assert.NotContains(t, body, "secret.internal")
	})
}

func TestTestServiceCheck_RouterRules(t *testing.T) {
	tests := []struct {
		name string
		res  func(e *echo.Echo) *http.Response
		want int
		code string
	}{
		{"no session", func(e *echo.Echo) *http.Response {
			return do(e, http.MethodPost, serviceTestURL, tcpTestBody, withCSRF, withJSON)
		}, http.StatusUnauthorized, "unauthenticated"},
		{"no CSRF token", func(e *echo.Echo) *http.Response {
			return do(e, http.MethodPost, serviceTestURL, tcpTestBody, withSession, withJSON)
		}, http.StatusForbidden, "csrf_failed"},
		{"body over the limit", func(e *echo.Echo) *http.Response {
			return postServiceTest(e, `{"check":{"type":"tcp","host":"`+strings.Repeat("a", 200)+`","port":80}}`)
		}, http.StatusRequestEntityTooLarge, "payload_too_large"},
		{"not JSON", func(e *echo.Echo) *http.Response {
			return do(e, http.MethodPost, serviceTestURL, tcpTestBody, withSession, withCSRF,
				func(r *http.Request) { r.Header.Set(echo.HeaderContentType, "text/plain") })
		}, http.StatusUnsupportedMediaType, "unsupported_media_type"},
		{"no body", func(e *echo.Echo) *http.Response {
			return do(e, http.MethodPost, serviceTestURL, "", withSession, withCSRF, withJSON)
		}, http.StatusBadRequest, "malformed_request"},
		{"malformed JSON", func(e *echo.Echo) *http.Response {
			return postServiceTest(e, `{"check":`)
		}, http.StatusBadRequest, "malformed_request"},
		{"malformed check", func(e *echo.Echo) *http.Response {
			return postServiceTest(e, `{"check":{"type":"tcp","host":"h","port":"eighty"}}`)
		}, http.StatusBadRequest, "malformed_request"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spy := &checkTesterSpy{result: domain.ServiceTestResult{Healthy: true}}
			e := newRouter(t, routerOptions{checkTester: spy, maxRequestBytes: 100})

			res := tt.res(e)

			require.Equal(t, tt.want, res.StatusCode)
			testutil.AssertConforms(t, "testServiceCheck", res)
			assert.Equal(t, tt.code, problemCode(t, res))
			assert.Empty(t, spy.inputs, "nothing is tested")
		})
	}
	t.Run("the same request with a session and the token reaches the spy", func(t *testing.T) {
		spy := &checkTesterSpy{result: domain.ServiceTestResult{Healthy: true}}
		res := postServiceTest(newRouter(t, routerOptions{checkTester: spy, maxRequestBytes: 100}), tcpTestBody)
		require.Equal(t, http.StatusOK, res.StatusCode)
		assert.Len(t, spy.inputs, 1)
	})
}

func TestTestServiceCheck_LogsNothingOnSuccess(t *testing.T) {
	var logs bytes.Buffer
	spy := &checkTesterSpy{result: domain.ServiceTestResult{Healthy: true, HTTPStatus: ptr(200), Body: "body-secret"}}
	e := newRouter(t, routerOptions{checkTester: spy, logOutput: &logs})

	res := postServiceTest(e, `{"check":{"type":"http","method":"GET","url":"https://secret.example/x","headers":[{"name":"Authorization","value":"tok-secret"}]}}`)

	require.Equal(t, http.StatusOK, res.StatusCode)
	assert.Empty(t, logs.String())

	// The same setup does log when the test fails unexpectedly: the capture works.
	spy.err = errors.New("boom")
	res = postServiceTest(e, httpTestBody)
	require.Equal(t, http.StatusInternalServerError, res.StatusCode)
	assert.Contains(t, logs.String(), "unexpected error")
}
