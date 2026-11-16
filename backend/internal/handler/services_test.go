package handler_test

import (
	"bytes"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/testutil"
)

var createdAt = time.Date(2026, 5, 6, 7, 8, 9, 0, time.UTC)

func ptr[T any](v T) *T { return &v }

// postService sends body to createService with a session and the CSRF token.
func postService(e *echo.Echo, body string, opts ...requestOption) *http.Response {
	opts = append([]requestOption{withSession, withCSRF, withJSON}, opts...)
	return do(e, http.MethodPost, "/api/services", body, opts...)
}

func baseService(id, name string) domain.Service {
	return domain.Service{
		ID: id, Name: name, NameKey: domain.ServiceNameKey(name),
		HTTPQueryParams: []domain.NameValue{}, HTTPHeaders: []domain.NameValue{}, JSONRules: []domain.JSONRule{},
		HTTPBodyType: domain.BodyTypeNone, JSONRuleMode: domain.JSONRuleModeAny,
		CheckIntervalSeconds: 60, TimeoutSeconds: 10, RetryCount: 1, RetryIntervalSeconds: 5,
		AlertsEnabled: true, CreatedAt: createdAt, UpdatedAt: createdAt,
	}
}

func minimalHTTPView() domain.ServiceView {
	s := baseService("id-1", "api")
	s.CheckType = domain.CheckTypeHTTP
	s.HTTPMethod, s.HTTPURL = ptr("GET"), ptr("https://x")
	return domain.ServiceView{Service: s, State: domain.ServiceState{ServiceID: "id-1", Status: domain.StatusNotYetChecked}}
}

func fullHTTPView() domain.ServiceView {
	v := minimalHTTPView()
	s := &v.Service
	s.Name = "Full"
	s.HTTPMethod, s.HTTPURL = ptr("PATCH"), ptr("https://x/y")
	s.HTTPQueryParams = []domain.NameValue{{Name: "b", Value: "2"}}
	s.HTTPHeaders = []domain.NameValue{{Name: "A", Value: ""}}
	s.HTTPBodyType, s.HTTPBodyContent = domain.BodyTypeJSON, `{"k":1}`
	s.JSONRules = []domain.JSONRule{{Field: "ok", FailingValue: "true"}, {Field: "up", FailingValue: true}}
	s.JSONRuleMode = domain.JSONRuleModeAll
	s.CertCheck, s.CertMinDaysLeft = true, ptr(14)
	s.IgnoreCertErrs = true
	s.AlertsEnabled, s.ShownOnPublicView = false, true
	s.UnhealthyMessage, s.RecoveryMessage = "down", "up"
	return v
}

func tcpView() domain.ServiceView {
	s := baseService("id-2", "db")
	s.CheckType = domain.CheckTypeTCP
	s.TCPHost, s.TCPPort = ptr("db.local"), ptr(5432)
	return domain.ServiceView{Service: s, State: domain.ServiceState{ServiceID: "id-2", Status: domain.StatusNotYetChecked}}
}

const stateNotYetChecked = `{"status":"not_yet_checked","last_checked_at":null,"last_status_change_at":null,"last_failure_reason":null}`

func TestCreateService_Answers201WithTheSavedService(t *testing.T) {
	tests := []struct {
		name string
		view domain.ServiceView
		want string
	}{
		{"http with defaults and empty lists", minimalHTTPView(), `{
			"id":"id-1","name":"api","paused":false,"target_count":0,"alert_delivery_failed":false,
			"state":` + stateNotYetChecked + `,
			"settings":{"check_interval_seconds":60,"timeout_seconds":10,"retry_count":1,"retry_interval_seconds":5},
			"alerts_enabled":true,"shown_on_public_view":false,"unhealthy_message":"","recovery_message":"",
			"check":{"type":"http","method":"GET","url":"https://x","query_params":[],"headers":[],
				"body":{"type":"none","content":""},"json_rules":[],"json_rule_mode":"any",
				"certificate_check":{"enabled":false},"ignore_certificate_errors":false}}`},
		{"http with everything set", fullHTTPView(), `{
			"id":"id-1","name":"Full","paused":false,"target_count":0,"alert_delivery_failed":false,
			"state":` + stateNotYetChecked + `,
			"settings":{"check_interval_seconds":60,"timeout_seconds":10,"retry_count":1,"retry_interval_seconds":5},
			"alerts_enabled":false,"shown_on_public_view":true,"unhealthy_message":"down","recovery_message":"up",
			"check":{"type":"http","method":"PATCH","url":"https://x/y","query_params":[{"name":"b","value":"2"}],
				"headers":[{"name":"A","value":""}],"body":{"type":"json","content":"{\"k\":1}"},
				"json_rules":[{"field":"ok","failing_value":"true"},{"field":"up","failing_value":true}],
				"json_rule_mode":"all","certificate_check":{"enabled":true,"min_days_left":14},
				"ignore_certificate_errors":true}}`},
		{"tcp", tcpView(), `{
			"id":"id-2","name":"db","paused":false,"target_count":0,"alert_delivery_failed":false,
			"state":` + stateNotYetChecked + `,
			"settings":{"check_interval_seconds":60,"timeout_seconds":10,"retry_count":1,"retry_interval_seconds":5},
			"alerts_enabled":true,"shown_on_public_view":false,"unhealthy_message":"","recovery_message":"",
			"check":{"type":"tcp","host":"db.local","port":5432}}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			e := newRouter(t, routerOptions{services: &serviceSpy{view: tc.view}})

			res := postService(e, `{"name":"x"}`)

			require.Equal(t, http.StatusCreated, res.StatusCode)
			testutil.AssertConforms(t, "createService", res)
			assert.Empty(t, res.Header.Get("Location"))
			assert.JSONEq(t, tc.want, readBody(t, res))
		})
	}
}

func TestCreateService_ErrorsMapToTheirCodes(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		code   string
		title  string
		status int
	}{
		{"name taken", domain.ErrServiceNameTaken, "service_name_taken", "Name already used", http.StatusConflict},
		{"limit reached", domain.ErrServiceLimitReached, "service_limit_reached", "Service limit reached", http.StatusConflict},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			e := newRouter(t, routerOptions{services: &serviceSpy{err: tc.err}})

			res := postService(e, `{"name":"x"}`)

			require.Equal(t, tc.status, res.StatusCode)
			testutil.AssertConforms(t, "createService", res)
			assert.JSONEq(t, `{"title":"`+tc.title+`","status":409,"code":"`+tc.code+`"}`, readBody(t, res),
				"no errors and no detail")
		})
	}
}

func TestCreateService_ValidationErrorIsAll422Fields(t *testing.T) {
	e := newRouter(t, routerOptions{services: &serviceSpy{err: domain.ValidationError{Fields: []domain.FieldError{
		{Field: "name", Code: domain.FieldErrorRequired, Message: "Enter a name."},
		{Field: "check.headers[2].value", Code: domain.FieldErrorTooLong, Message: "Use 8 characters or fewer."},
		{Field: "settings", Code: domain.FieldErrorCheckBudgetExceeded, Message: "The longest attempt takes 33 seconds."},
	}}}})

	res := postService(e, `{"name":"x"}`)

	require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode)
	testutil.AssertConforms(t, "createService", res)
	assert.JSONEq(t, `{"title":"Validation failed","status":422,"code":"validation_failed","errors":[
		{"field":"name","code":"required","message":"Enter a name."},
		{"field":"check.headers[2].value","code":"too_long","message":"Use 8 characters or fewer."},
		{"field":"settings","code":"check_budget_exceeded","message":"The longest attempt takes 33 seconds."}]}`,
		readBody(t, res))
}

func TestCreateService_UnexpectedErrorHidesItsText(t *testing.T) {
	e := newRouter(t, routerOptions{services: &serviceSpy{err: errors.New("disk I/O error at /data/monitory.db")}})

	res := postService(e, `{"name":"x"}`)

	require.Equal(t, http.StatusInternalServerError, res.StatusCode)
	testutil.AssertConforms(t, "createService", res)
	body := readBody(t, res)
	assert.Contains(t, body, `"code":"internal_error"`)
	assert.NotContains(t, body, "disk")
}

func TestCreateService_LogsOneLineWithTheIDAndNameOnly(t *testing.T) {
	var logs bytes.Buffer
	view := fullHTTPView()
	view.Service.HTTPURL = ptr("https://secret.example/path")
	view.Service.HTTPHeaders = []domain.NameValue{{Name: "Authorization", Value: "Bearer s3cret"}}
	view.Service.HTTPBodyContent = "body-text"
	e := newRouter(t, routerOptions{services: &serviceSpy{view: view}, logOutput: &logs})

	res := postService(e, `{"name":"x"}`)

	require.Equal(t, http.StatusCreated, res.StatusCode)
	lines := strings.Split(strings.TrimSpace(logs.String()), "\n")
	require.Len(t, lines, 1)
	_, attrs, found := strings.Cut(lines[0], `msg="service added" `)
	require.True(t, found, "line: %s", lines[0])
	assert.Equal(t, "service_id=id-1 service_name=Full", attrs)
	for _, secret := range []string{"secret", "Authorization", "body-text"} {
		assert.NotContains(t, logs.String(), secret)
	}
}

func TestCreateService_BindingAndGateFailuresNeverReachTheSpy(t *testing.T) {
	const validBody = `{"name":"x","check":{"type":"tcp","host":"h","port":1}}`
	tests := []struct {
		name   string
		body   string
		opts   []requestOption
		router routerOptions
		status int
		code   string
	}{
		{"no body", "", []requestOption{withSession, withCSRF}, routerOptions{}, http.StatusBadRequest, "malformed_request"},
		{"body that is cut off", `{"name":`, []requestOption{withSession, withCSRF, withJSON}, routerOptions{}, http.StatusBadRequest, "malformed_request"},
		{"name of the wrong type", `{"name":5}`, []requestOption{withSession, withCSRF, withJSON}, routerOptions{}, http.StatusBadRequest, "malformed_request"},
		{"list instead of object", `[]`, []requestOption{withSession, withCSRF, withJSON}, routerOptions{}, http.StatusBadRequest, "malformed_request"},
		{"another content type", validBody, []requestOption{withSession, withCSRF, func(r *http.Request) { r.Header.Set(echo.HeaderContentType, "text/plain") }}, routerOptions{}, http.StatusUnsupportedMediaType, "unsupported_media_type"},
		{"one byte over the size limit", validBody + " ", []requestOption{withSession, withCSRF, withJSON}, routerOptions{maxRequestBytes: len(validBody)}, http.StatusRequestEntityTooLarge, "payload_too_large"},
		{"no session", validBody, []requestOption{withCSRF, withJSON}, routerOptions{}, http.StatusUnauthorized, "unauthenticated"},
		{"no CSRF token", validBody, []requestOption{withSession, withJSON}, routerOptions{}, http.StatusForbidden, "csrf_failed"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			spy := &serviceSpy{view: tcpView()}
			tc.router.services = spy
			e := newRouter(t, tc.router)

			res := do(e, http.MethodPost, "/api/services", tc.body, tc.opts...)

			require.Equal(t, tc.status, res.StatusCode)
			testutil.AssertConforms(t, "createService", res)
			assert.Equal(t, tc.code, problemCode(t, res))
			assert.Empty(t, spy.inputs)
		})
	}

	t.Run("a body exactly at the size limit reaches the spy", func(t *testing.T) {
		spy := &serviceSpy{view: tcpView()}
		e := newRouter(t, routerOptions{services: spy, maxRequestBytes: len(validBody)})

		res := postService(e, validBody)

		require.Equal(t, http.StatusCreated, res.StatusCode)
		assert.Len(t, spy.inputs, 1)
	})
}
