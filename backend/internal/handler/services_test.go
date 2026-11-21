package handler_test

import (
	"bytes"
	"encoding/json"
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

func getServices(e *echo.Echo, opts ...requestOption) *http.Response {
	return do(e, http.MethodGet, "/api/services", "", append([]requestOption{withSession}, opts...)...)
}

func deleteService(e *echo.Echo, id string, opts ...requestOption) *http.Response {
	return do(e, http.MethodDelete, "/api/services/"+id, "", append([]requestOption{withSession, withCSRF}, opts...)...)
}

func TestListServices_EmptyResultIsAnEmptyList(t *testing.T) {
	for name, views := range map[string][]domain.ServiceView{"nil": nil, "empty": {}} {
		t.Run(name, func(t *testing.T) {
			e := newRouter(t, routerOptions{services: &serviceSpy{views: views}})

			res := getServices(e)

			require.Equal(t, http.StatusOK, res.StatusCode)
			testutil.AssertConforms(t, "listServices", res)
			assert.Equal(t, "[]", strings.TrimSpace(readBody(t, res)))
		})
	}
}

func TestListServices_ReturnsEveryServiceInTheOrderGiven(t *testing.T) {
	full := fullHTTPView()
	full.Service.Paused = true
	full.TargetCount, full.AlertDeliveryFailed = 3, true
	e := newRouter(t, routerOptions{services: &serviceSpy{views: []domain.ServiceView{tcpView(), full}}})

	res := getServices(e)

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "listServices", res)
	assert.JSONEq(t, `[{
		"id":"id-2","name":"db","paused":false,"target_count":0,"alert_delivery_failed":false,
		"state":`+stateNotYetChecked+`,
		"settings":{"check_interval_seconds":60,"timeout_seconds":10,"retry_count":1,"retry_interval_seconds":5},
		"alerts_enabled":true,"shown_on_public_view":false,"unhealthy_message":"","recovery_message":"",
		"check":{"type":"tcp","host":"db.local","port":5432}},
	{
		"id":"id-1","name":"Full","paused":true,"target_count":3,"alert_delivery_failed":true,
		"state":`+stateNotYetChecked+`,
		"settings":{"check_interval_seconds":60,"timeout_seconds":10,"retry_count":1,"retry_interval_seconds":5},
		"alerts_enabled":false,"shown_on_public_view":true,"unhealthy_message":"down","recovery_message":"up",
		"check":{"type":"http","method":"PATCH","url":"https://x/y","query_params":[{"name":"b","value":"2"}],
			"headers":[{"name":"A","value":""}],"body":{"type":"json","content":"{\"k\":1}"},
			"json_rules":[{"field":"ok","failing_value":"true"},{"field":"up","failing_value":true}],
			"json_rule_mode":"all","certificate_check":{"enabled":true,"min_days_left":14},
			"ignore_certificate_errors":true}}]`, readBody(t, res))
}

func TestListServices_MapsTheSameWayAsCreateService(t *testing.T) {
	view := fullHTTPView()
	e := newRouter(t, routerOptions{services: &serviceSpy{view: view, views: []domain.ServiceView{view}}})

	var created map[string]any
	var listed []map[string]any
	require.NoError(t, json.Unmarshal([]byte(readBody(t, postService(e, `{"name":"x"}`))), &created))
	require.NoError(t, json.Unmarshal([]byte(readBody(t, getServices(e))), &listed))

	require.Len(t, listed, 1)
	assert.Equal(t, created, listed[0])
}

func TestListServices_UnexpectedErrorHidesItsText(t *testing.T) {
	e := newRouter(t, routerOptions{services: &serviceSpy{err: errors.New("disk I/O error at /data/monitory.db")}})

	res := getServices(e)

	require.Equal(t, http.StatusInternalServerError, res.StatusCode)
	testutil.AssertConforms(t, "listServices", res)
	body := readBody(t, res)
	assert.Contains(t, body, `"code":"internal_error"`)
	assert.NotContains(t, body, "disk")
}

func TestListServices_WithoutASessionIs401AndNeverReachesTheSpy(t *testing.T) {
	spy := &serviceSpy{}
	e := newRouter(t, routerOptions{services: spy})

	res := do(e, http.MethodGet, "/api/services", "")

	require.Equal(t, http.StatusUnauthorized, res.StatusCode)
	testutil.AssertConforms(t, "listServices", res)
	assert.Equal(t, "unauthenticated", problemCode(t, res))
	assert.Zero(t, spy.listCalls)
}

func TestDeleteService_Answers204WithAnEmptyBody(t *testing.T) {
	spy := &serviceSpy{}
	e := newRouter(t, routerOptions{services: spy})

	res := deleteService(e, "id-1")

	require.Equal(t, http.StatusNoContent, res.StatusCode)
	testutil.AssertConforms(t, "deleteService", res)
	assert.Empty(t, readBody(t, res))
	assert.Empty(t, res.Header.Values("Set-Cookie"))
	assert.Equal(t, []string{"id-1"}, spy.deleted)
}

func TestDeleteService_ErrorsMapToTheirCodes(t *testing.T) {
	t.Run("not found", func(t *testing.T) {
		e := newRouter(t, routerOptions{services: &serviceSpy{err: domain.ErrNotFound}})

		res := deleteService(e, "id-1")

		require.Equal(t, http.StatusNotFound, res.StatusCode)
		testutil.AssertConforms(t, "deleteService", res)
		body := readBody(t, res)
		assert.Contains(t, body, `"code":"not_found"`)
		assert.Contains(t, body, `"title":"Not found"`)
	})
	t.Run("unexpected error hides its text", func(t *testing.T) {
		e := newRouter(t, routerOptions{services: &serviceSpy{err: errors.New("disk I/O error at /data/monitory.db")}})

		res := deleteService(e, "id-1")

		require.Equal(t, http.StatusInternalServerError, res.StatusCode)
		testutil.AssertConforms(t, "deleteService", res)
		body := readBody(t, res)
		assert.Contains(t, body, `"code":"internal_error"`)
		assert.NotContains(t, body, "disk")
	})
}

func TestDeleteService_LogsOneLineWithTheIDOnly(t *testing.T) {
	var logs bytes.Buffer
	e := newRouter(t, routerOptions{services: &serviceSpy{}, logOutput: &logs})

	res := deleteService(e, "id-1")

	require.Equal(t, http.StatusNoContent, res.StatusCode)
	lines := strings.Split(strings.TrimSpace(logs.String()), "\n")
	require.Len(t, lines, 1)
	_, attrs, found := strings.Cut(lines[0], `msg="service deleted" `)
	require.True(t, found, "line: %s", lines[0])
	assert.Equal(t, "service_id=id-1", attrs)
}

func TestDeleteService_GateFailuresNeverReachTheSpy(t *testing.T) {
	tests := []struct {
		name   string
		opts   []requestOption
		status int
		code   string
	}{
		{"no session", []requestOption{withCSRF}, http.StatusUnauthorized, "unauthenticated"},
		{"no CSRF token", []requestOption{withSession}, http.StatusForbidden, "csrf_failed"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			spy := &serviceSpy{}
			e := newRouter(t, routerOptions{services: spy})

			res := do(e, http.MethodDelete, "/api/services/id-1", "", tc.opts...)

			require.Equal(t, tc.status, res.StatusCode)
			testutil.AssertConforms(t, "deleteService", res)
			assert.Equal(t, tc.code, problemCode(t, res))
			assert.Empty(t, spy.deleted)
		})
	}

	t.Run("baseline: with both, the spy is called", func(t *testing.T) {
		spy := &serviceSpy{}
		e := newRouter(t, routerOptions{services: spy})

		require.Equal(t, http.StatusNoContent, deleteService(e, "id-1").StatusCode)
		assert.Equal(t, []string{"id-1"}, spy.deleted)
	})
}

func getOneService(e *echo.Echo, id string, opts ...requestOption) *http.Response {
	return do(e, http.MethodGet, "/api/services/"+id, "", append([]requestOption{withSession}, opts...)...)
}

func putService(e *echo.Echo, id, body string, opts ...requestOption) *http.Response {
	opts = append([]requestOption{withSession, withCSRF, withJSON}, opts...)
	return do(e, http.MethodPut, "/api/services/"+id, body, opts...)
}

func TestGetService_Answers200WithTheSameMappingAsListAndCreate(t *testing.T) {
	headerView := fullHTTPView()
	headerView.Service.HTTPHeaders = []domain.NameValue{{Name: "Authorization", Value: "Bearer a-full-secret-value"}}
	for name, view := range map[string]domain.ServiceView{"http": headerView, "tcp": tcpView()} {
		t.Run(name, func(t *testing.T) {
			spy := &serviceSpy{view: view, views: []domain.ServiceView{view}}
			e := newRouter(t, routerOptions{services: spy})

			res := getOneService(e, "id-1")

			require.Equal(t, http.StatusOK, res.StatusCode)
			testutil.AssertConforms(t, "getService", res)
			body := readBody(t, res)
			assert.Equal(t, []string{"id-1"}, spy.got)

			var got, listed []map[string]any
			require.NoError(t, json.Unmarshal([]byte("["+body+"]"), &got))
			require.NoError(t, json.Unmarshal([]byte(readBody(t, getServices(e))), &listed))
			assert.Equal(t, listed, got, "the same mapping as an item of the list")
			var created map[string]any
			require.NoError(t, json.Unmarshal([]byte(readBody(t, postService(e, `{"name":"x"}`))), &created))
			assert.Equal(t, created, got[0], "and as the answer to create")
			if name == "http" {
				assert.Contains(t, body, "Bearer a-full-secret-value", "header values come back in full (FR-39)")
			}
		})
	}
}

func TestGetService_NotFoundIs404(t *testing.T) {
	e := newRouter(t, routerOptions{services: &serviceSpy{err: domain.ErrNotFound}})

	res := getOneService(e, "nope")

	require.Equal(t, http.StatusNotFound, res.StatusCode)
	testutil.AssertConforms(t, "getService", res)
	assert.Equal(t, "not_found", problemCode(t, res))
}

func TestGetService_UnexpectedErrorHidesItsText(t *testing.T) {
	e := newRouter(t, routerOptions{services: &serviceSpy{err: errors.New("disk I/O error at /data/monitory.db")}})

	res := getOneService(e, "id-1")

	require.Equal(t, http.StatusInternalServerError, res.StatusCode)
	testutil.AssertConforms(t, "getService", res)
	body := readBody(t, res)
	assert.Contains(t, body, `"code":"internal_error"`)
	assert.NotContains(t, body, "disk")
}

func TestGetService_WithoutASessionIs401AndNeverReachesTheSpy(t *testing.T) {
	spy := &serviceSpy{view: tcpView()}
	e := newRouter(t, routerOptions{services: spy})

	res := do(e, http.MethodGet, "/api/services/id-1", "")

	require.Equal(t, http.StatusUnauthorized, res.StatusCode)
	testutil.AssertConforms(t, "getService", res)
	assert.Equal(t, "unauthenticated", problemCode(t, res))
	assert.Empty(t, spy.got)
}

func TestUpdateService_Answers200WithTheSavedServiceAndPassesTheInput(t *testing.T) {
	spy := &serviceSpy{view: fullHTTPView()}
	e := newRouter(t, routerOptions{services: spy})

	res := putService(e, "id-1", `{"name":" Full ","check":{"type":"tcp","host":"h","port":7},"alerts_enabled":false,
		"id":"other","paused":true,"state":{"status":"healthy"}}`)

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "updateService", res)
	assert.Equal(t, []string{"id-1"}, spy.updatedID)
	require.Len(t, spy.inputs, 1)
	in := spy.inputs[0]
	assert.Equal(t, " Full ", in.Name, "the handler maps; the usecase trims")
	assert.Equal(t, "tcp", in.Check.Type)
	assert.Equal(t, domain.TCPCheckInput{Host: "h", Port: 7}, in.Check.TCP)
	assert.Equal(t, ptr(false), in.AlertsEnabled)

	var got map[string]any
	require.NoError(t, json.Unmarshal([]byte(readBody(t, res)), &got))
	assert.Equal(t, "id-1", got["id"], "read-only fields come from the view, not the body")
	assert.Equal(t, false, got["paused"])
	assert.Equal(t, "Full", got["name"])
}

func TestUpdateService_ErrorsMapToTheirCodes(t *testing.T) {
	tests := []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"not found", domain.ErrNotFound, http.StatusNotFound, "not_found"},
		{"name taken", domain.ErrServiceNameTaken, http.StatusConflict, "service_name_taken"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			e := newRouter(t, routerOptions{services: &serviceSpy{err: tc.err}})

			res := putService(e, "id-1", `{"name":"x"}`)

			require.Equal(t, tc.status, res.StatusCode)
			testutil.AssertConforms(t, "updateService", res)
			assert.Equal(t, tc.code, problemCode(t, res))
		})
	}

	t.Run("validation error lists every field", func(t *testing.T) {
		e := newRouter(t, routerOptions{services: &serviceSpy{err: domain.ValidationError{Fields: []domain.FieldError{
			{Field: "name", Code: domain.FieldErrorRequired, Message: "Enter a name."},
			{Field: "unhealthy_message", Code: domain.FieldErrorTooLong, Message: "Use 500 characters or fewer."},
		}}}})

		res := putService(e, "id-1", `{"name":"x"}`)

		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode)
		testutil.AssertConforms(t, "updateService", res)
		assert.JSONEq(t, `{"title":"Validation failed","status":422,"code":"validation_failed","errors":[
			{"field":"name","code":"required","message":"Enter a name."},
			{"field":"unhealthy_message","code":"too_long","message":"Use 500 characters or fewer."}]}`, readBody(t, res))
	})

	t.Run("another error hides its text", func(t *testing.T) {
		e := newRouter(t, routerOptions{services: &serviceSpy{err: errors.New("disk I/O error at /data/monitory.db")}})

		res := putService(e, "id-1", `{"name":"x"}`)

		require.Equal(t, http.StatusInternalServerError, res.StatusCode)
		testutil.AssertConforms(t, "updateService", res)
		body := readBody(t, res)
		assert.Contains(t, body, `"code":"internal_error"`)
		assert.NotContains(t, body, "disk")
	})
}

func TestUpdateService_LogsOneLineWithTheIDAndNameOnly(t *testing.T) {
	var logs bytes.Buffer
	view := fullHTTPView()
	view.Service.HTTPURL = ptr("https://secret.example/path")
	view.Service.HTTPHeaders = []domain.NameValue{{Name: "Authorization", Value: "Bearer s3cret"}}
	view.Service.HTTPBodyContent = "body-text"
	e := newRouter(t, routerOptions{services: &serviceSpy{view: view}, logOutput: &logs})

	res := putService(e, "id-1", `{"name":"x"}`)

	require.Equal(t, http.StatusOK, res.StatusCode)
	lines := strings.Split(strings.TrimSpace(logs.String()), "\n")
	require.Len(t, lines, 1)
	_, attrs, found := strings.Cut(lines[0], `msg="service updated" `)
	require.True(t, found, "line: %s", lines[0])
	assert.Equal(t, "service_id=id-1 service_name=Full", attrs)
	for _, secret := range []string{"secret", "Authorization", "body-text"} {
		assert.NotContains(t, logs.String(), secret)
	}
}

func TestUpdateService_GateFailuresNeverReachTheSpy(t *testing.T) {
	const validBody = `{"name":"x","check":{"type":"tcp","host":"h","port":1}}`
	tests := []struct {
		name   string
		body   string
		opts   []requestOption
		router routerOptions
		status int
		code   string
	}{
		{"no session", validBody, []requestOption{withCSRF, withJSON}, routerOptions{}, http.StatusUnauthorized, "unauthenticated"},
		{"no CSRF token", validBody, []requestOption{withSession, withJSON}, routerOptions{}, http.StatusForbidden, "csrf_failed"},
		{"one byte over the size limit", validBody + " ", []requestOption{withSession, withCSRF, withJSON}, routerOptions{maxRequestBytes: len(validBody)}, http.StatusRequestEntityTooLarge, "payload_too_large"},
		{"another content type", validBody, []requestOption{withSession, withCSRF, func(r *http.Request) { r.Header.Set(echo.HeaderContentType, "text/plain") }}, routerOptions{}, http.StatusUnsupportedMediaType, "unsupported_media_type"},
		{"malformed body", `{"name":`, []requestOption{withSession, withCSRF, withJSON}, routerOptions{}, http.StatusBadRequest, "malformed_request"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			spy := &serviceSpy{view: tcpView()}
			tc.router.services = spy
			e := newRouter(t, tc.router)

			res := do(e, http.MethodPut, "/api/services/id-1", tc.body, tc.opts...)

			require.Equal(t, tc.status, res.StatusCode)
			testutil.AssertConforms(t, "updateService", res)
			assert.Equal(t, tc.code, problemCode(t, res))
			assert.Empty(t, spy.updatedID)
		})
	}

	t.Run("a body exactly at the size limit reaches the spy", func(t *testing.T) {
		spy := &serviceSpy{view: tcpView()}
		e := newRouter(t, routerOptions{services: spy, maxRequestBytes: len(validBody)})

		res := putService(e, "id-1", validBody)

		require.Equal(t, http.StatusOK, res.StatusCode)
		assert.Equal(t, []string{"id-1"}, spy.updatedID)
	})
}

// pauseOps are the two operations of the pause and resume tests: the spy field that holds
// the ids they receive, the log message, and the paused flag of the view they answer.
var pauseOps = []struct {
	name, op, path, msg string
	paused              bool
	ids                 func(*serviceSpy) []string
}{
	{"pause", "pauseService", "/pause", "service paused", true, func(s *serviceSpy) []string { return s.paused }},
	{"resume", "resumeService", "/resume", "service resumed", false, func(s *serviceSpy) []string { return s.resumed }},
}

func postAction(e *echo.Echo, id, path string, opts ...requestOption) *http.Response {
	return do(e, http.MethodPost, "/api/services/"+id+path, "", append([]requestOption{withSession, withCSRF}, opts...)...)
}

func TestPauseAndResumeService_Answer200WithTheMappedService(t *testing.T) {
	for _, op := range pauseOps {
		t.Run(op.name, func(t *testing.T) {
			view := fullHTTPView()
			view.Service.Paused = op.paused
			view.State = domain.ServiceState{ServiceID: "id-1", Status: domain.StatusHealthy, LastCheckedAt: &createdAt, LastStatusChangeAt: &createdAt}
			spy := &serviceSpy{view: view}
			e := newRouter(t, routerOptions{services: spy})

			res := postAction(e, "id-5", op.path)

			require.Equal(t, http.StatusOK, res.StatusCode)
			testutil.AssertConforms(t, op.op, res)
			var got, want map[string]any
			body := readBody(t, res)
			require.NoError(t, json.Unmarshal([]byte(body), &got))
			assert.Equal(t, op.paused, got["paused"])
			assert.Equal(t, "healthy", got["state"].(map[string]any)["status"])
			require.NoError(t, json.Unmarshal([]byte(readBody(t, getOneService(newRouter(t, routerOptions{services: spy}), "id-1"))), &want))
			assert.Equal(t, want, got, "the same mapping as getService")
			assert.Equal(t, []string{"id-5"}, op.ids(spy))
		})
	}
}

func TestPauseAndResumeService_ErrorsMapToTheirCodes(t *testing.T) {
	for _, op := range pauseOps {
		t.Run(op.name+" not found", func(t *testing.T) {
			e := newRouter(t, routerOptions{services: &serviceSpy{err: domain.ErrNotFound}})

			res := postAction(e, "id-1", op.path)

			require.Equal(t, http.StatusNotFound, res.StatusCode)
			testutil.AssertConforms(t, op.op, res)
			assert.Equal(t, "not_found", problemCode(t, res))
		})
		t.Run(op.name+" unexpected error hides its text", func(t *testing.T) {
			e := newRouter(t, routerOptions{services: &serviceSpy{err: errors.New("disk I/O error at /data/monitory.db")}})

			res := postAction(e, "id-1", op.path)

			require.Equal(t, http.StatusInternalServerError, res.StatusCode)
			testutil.AssertConforms(t, op.op, res)
			body := readBody(t, res)
			assert.Contains(t, body, `"code":"internal_error"`)
			assert.NotContains(t, body, "disk")
		})
	}
}

func TestPauseAndResumeService_LogOneLineWithTheIDAndNameOnly(t *testing.T) {
	for _, op := range pauseOps {
		t.Run(op.name, func(t *testing.T) {
			var logs bytes.Buffer
			view := fullHTTPView()
			view.Service.HTTPURL = ptr("https://secret.example/path")
			view.Service.HTTPHeaders = []domain.NameValue{{Name: "Authorization", Value: "Bearer s3cret"}}
			e := newRouter(t, routerOptions{services: &serviceSpy{view: view}, logOutput: &logs})

			res := postAction(e, "id-1", op.path)

			require.Equal(t, http.StatusOK, res.StatusCode)
			lines := strings.Split(strings.TrimSpace(logs.String()), "\n")
			require.Len(t, lines, 1)
			_, attrs, found := strings.Cut(lines[0], `msg="`+op.msg+`" `)
			require.True(t, found, "line: %s", lines[0])
			assert.Equal(t, "service_id=id-1 service_name=Full", attrs)
			for _, secret := range []string{"secret", "Authorization"} {
				assert.NotContains(t, logs.String(), secret)
			}
		})
	}
}

func TestPauseAndResumeService_GateFailuresNeverReachTheSpy(t *testing.T) {
	tests := []struct {
		name   string
		opts   []requestOption
		status int
		code   string
	}{
		{"no session", []requestOption{withCSRF}, http.StatusUnauthorized, "unauthenticated"},
		{"no CSRF token", []requestOption{withSession}, http.StatusForbidden, "csrf_failed"},
	}
	for _, op := range pauseOps {
		for _, tc := range tests {
			t.Run(op.name+" "+tc.name, func(t *testing.T) {
				spy := &serviceSpy{view: tcpView()}
				e := newRouter(t, routerOptions{services: spy})

				res := do(e, http.MethodPost, "/api/services/id-1"+op.path, "", tc.opts...)

				require.Equal(t, tc.status, res.StatusCode)
				testutil.AssertConforms(t, op.op, res)
				assert.Equal(t, tc.code, problemCode(t, res))
				assert.Empty(t, op.ids(spy))
			})
		}

		t.Run(op.name+" baseline: with both, the spy is called", func(t *testing.T) {
			spy := &serviceSpy{view: tcpView()}
			e := newRouter(t, routerOptions{services: spy})

			require.Equal(t, http.StatusOK, postAction(e, "id-1", op.path).StatusCode)
			assert.Equal(t, []string{"id-1"}, op.ids(spy))
		})
	}
}
