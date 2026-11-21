package handler_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/testutil"
)

// sentToSpy posts body and returns the one input that reached the usecase.
func sentToSpy(t *testing.T, body string) domain.ServiceInput {
	t.Helper()
	spy := &serviceSpy{view: minimalHTTPView()}
	e := newRouter(t, routerOptions{services: spy})

	res := postService(e, body)

	require.Equal(t, http.StatusCreated, res.StatusCode, "body: %s", body)
	require.Len(t, spy.inputs, 1, "body: %s", body)
	return spy.inputs[0]
}

func TestToServiceInput_HTTPCheckWithEveryField(t *testing.T) {
	got := sentToSpy(t, `{
		"name":"My API","alerts_enabled":false,"shown_on_public_view":true,
		"unhealthy_message":"down","recovery_message":"up",
		"settings":{"check_interval_seconds":120,"timeout_seconds":5,"retry_count":0,"retry_interval_seconds":4},
		"check":{"type":"http","method":"POST","url":"https://x/y",
			"query_params":[{"name":"b","value":"2"},{"name":"a","value":"1"}],
			"headers":[{"name":"Z","value":"last"},{"name":"A","value":""}],
			"body":{"type":"json","content":"{\"k\":1}"},
			"json_rules":[{"field":"ok","failing_value":"true"},{"field":"up","failing_value":true}],
			"json_rule_mode":"all",
			"certificate_check":{"enabled":true,"min_days_left":14},
			"ignore_certificate_errors":true}}`)

	assert.Equal(t, domain.ServiceInput{
		Name: "My API",
		Check: domain.CheckInput{Type: "http", HTTP: domain.HTTPCheckInput{
			Method:       "POST",
			URL:          "https://x/y",
			QueryParams:  []domain.NameValue{{Name: "b", Value: "2"}, {Name: "a", Value: "1"}},
			Headers:      []domain.NameValue{{Name: "Z", Value: "last"}, {Name: "A", Value: ""}},
			BodyType:     "json",
			BodyContent:  `{"k":1}`,
			JSONRules:    []domain.JSONRule{{Field: "ok", FailingValue: "true"}, {Field: "up", FailingValue: true}},
			JSONRuleMode: "all",

			CertificateCheckEnabled: true,
			CertMinDaysLeft:         ptr(14),
			IgnoreCertificateErrors: true,
		}},
		CheckIntervalSeconds: ptr(120),
		TimeoutSeconds:       ptr(5),
		RetryCount:           ptr(0),
		RetryIntervalSeconds: ptr(4),
		AlertsEnabled:        ptr(false),
		ShownOnPublicView:    ptr(true),
		UnhealthyMessage:     "down",
		RecoveryMessage:      "up",
	}, got)
}

func TestToServiceInput_TCPCheck(t *testing.T) {
	got := sentToSpy(t, `{"name":"db","check":{"type":"tcp","host":"db.local","port":5432}}`)

	assert.Equal(t, domain.ServiceInput{
		Name:  "db",
		Check: domain.CheckInput{Type: "tcp", TCP: domain.TCPCheckInput{Host: "db.local", Port: 5432}},
	}, got)
}

func TestToServiceInput_PropertiesOfTheOtherTypeAreDropped(t *testing.T) {
	tcp := sentToSpy(t, `{"name":"db","check":{"type":"tcp","host":"h","port":1,"url":"https://x","method":"GET",
		"headers":[{"name":"A","value":"b"}],"body":{"type":"json","content":"{}"}}}`)
	assert.Equal(t, domain.HTTPCheckInput{}, tcp.Check.HTTP)

	httpInput := sentToSpy(t, `{"name":"api","check":{"type":"http","method":"GET","url":"https://x","host":"h","port":80}}`)
	assert.Equal(t, domain.TCPCheckInput{}, httpInput.Check.TCP)
}

func TestToServiceInput_AbsentAndNullAreTheSame(t *testing.T) {
	absent := sentToSpy(t, `{"name":"api","check":{"type":"http","method":"GET","url":"https://x"}}`)
	nulls := sentToSpy(t, `{"name":"api","alerts_enabled":null,"shown_on_public_view":null,
		"unhealthy_message":null,"recovery_message":null,"settings":null,
		"check":{"type":"http","method":"GET","url":"https://x","query_params":null,"headers":null,"body":null,
			"json_rules":null,"json_rule_mode":null,"certificate_check":null,"ignore_certificate_errors":null}}`)
	partial := sentToSpy(t, `{"name":"api","settings":{},
		"check":{"type":"http","method":"GET","url":"https://x","certificate_check":{"enabled":true,"min_days_left":null}}}`)

	assert.Equal(t, absent, nulls)
	assert.Nil(t, absent.AlertsEnabled)
	assert.Nil(t, absent.ShownOnPublicView)
	assert.Nil(t, absent.CheckIntervalSeconds)
	assert.Nil(t, absent.TimeoutSeconds)
	assert.Nil(t, absent.RetryCount)
	assert.Nil(t, absent.RetryIntervalSeconds)
	assert.Nil(t, absent.Check.HTTP.CertMinDaysLeft)
	assert.Nil(t, partial.Check.HTTP.CertMinDaysLeft)
	assert.Nil(t, partial.CheckIntervalSeconds)
}

// What the usecase rejects with a field error is not a 400: it reaches the spy.
func TestToServiceInput_ShapesThatAreValidationErrorsReachTheUsecase(t *testing.T) {
	tests := []struct {
		name string
		body string
		want func(t *testing.T, got domain.ServiceInput)
	}{
		{"body null", `null`, func(t *testing.T, got domain.ServiceInput) {
			assert.Equal(t, domain.ServiceInput{}, got)
		}},
		{"check missing", `{"name":"a"}`, func(t *testing.T, got domain.ServiceInput) {
			assert.Empty(t, got.Check.Type)
		}},
		{"check null", `{"name":"a","check":null}`, func(t *testing.T, got domain.ServiceInput) {
			assert.Empty(t, got.Check.Type)
		}},
		{"check empty object", `{"name":"a","check":{}}`, func(t *testing.T, got domain.ServiceInput) {
			assert.Empty(t, got.Check.Type)
		}},
		{"check without type", `{"name":"a","check":{"url":"https://x"}}`, func(t *testing.T, got domain.ServiceInput) {
			assert.Empty(t, got.Check.Type)
		}},
		{"type null", `{"name":"a","check":{"type":null}}`, func(t *testing.T, got domain.ServiceInput) {
			assert.Empty(t, got.Check.Type)
		}},
		{"type ftp", `{"name":"a","check":{"type":"ftp","url":"ftp://x"}}`, func(t *testing.T, got domain.ServiceInput) {
			assert.Equal(t, "ftp", got.Check.Type)
		}},
		{"url null", `{"name":"a","check":{"type":"http","url":null}}`, func(t *testing.T, got domain.ServiceInput) {
			assert.Equal(t, domain.HTTPCheckInput{}, got.Check.HTTP)
		}},
		{"body empty object", `{"name":"a","check":{"type":"http","method":"GET","url":"https://x","body":{}}}`, func(t *testing.T, got domain.ServiceInput) {
			assert.Empty(t, got.Check.HTTP.BodyType)
			assert.Empty(t, got.Check.HTTP.BodyContent)
		}},
		{"certificate check empty object", `{"name":"a","check":{"type":"http","method":"GET","url":"https://x","certificate_check":{}}}`, func(t *testing.T, got domain.ServiceInput) {
			assert.False(t, got.Check.HTTP.CertificateCheckEnabled)
		}},
		{"header and query parameter without a name", `{"name":"a","check":{"type":"http","method":"GET","url":"https://x",
			"headers":[{"value":"v"},{"name":null}],"query_params":[{"value":"v"}]}}`, func(t *testing.T, got domain.ServiceInput) {
			assert.Equal(t, []domain.NameValue{{Value: "v"}, {}}, got.Check.HTTP.Headers)
			assert.Equal(t, []domain.NameValue{{Value: "v"}}, got.Check.HTTP.QueryParams)
		}},
		{"rule without a failing value, and with null", `{"name":"a","check":{"type":"http","method":"GET","url":"https://x",
			"json_rules":[{"field":"a"},{"field":"b","failing_value":null}]}}`, func(t *testing.T, got domain.ServiceInput) {
			assert.Equal(t, []domain.JSONRule{{Field: "a"}, {Field: "b"}}, got.Check.HTTP.JSONRules)
		}},
		{"port out of range is for validation", `{"name":"a","check":{"type":"tcp","host":"h","port":70000}}`, func(t *testing.T, got domain.ServiceInput) {
			assert.Equal(t, 70000, got.Check.TCP.Port)
		}},
		{"tcp port absent reads as 0", `{"name":"a","check":{"type":"tcp","host":"h"}}`, func(t *testing.T, got domain.ServiceInput) {
			assert.Zero(t, got.Check.TCP.Port)
		}},
		{"unknown properties are ignored", `{"name":"a","extra":1,"check":{"type":"tcp","host":"h","port":1,"more":[]}}`, func(t *testing.T, got domain.ServiceInput) {
			assert.Equal(t, "a", got.Name)
		}},
		{"a false failing value is kept", `{"name":"a","check":{"type":"http","method":"GET","url":"https://x",
			"json_rules":[{"field":"a","failing_value":false}]}}`, func(t *testing.T, got domain.ServiceInput) {
			assert.Equal(t, []domain.JSONRule{{Field: "a", FailingValue: false}}, got.Check.HTTP.JSONRules)
		}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tc.want(t, sentToSpy(t, tc.body))
		})
	}
}

func TestToServiceInput_ShapesThatDoNotFitTheContractAre400(t *testing.T) {
	const httpCheck = `"check":{"type":"http","method":"GET","url":"https://x"`
	tests := []struct{ name, body string }{
		{"check is a list", `{"name":"a","check":[]}`},
		{"check is a string", `{"name":"a","check":"http"}`},
		{"check is a number", `{"name":"a","check":5}`},
		{"check type is a number", `{"name":"a","check":{"type":5}}`},
		{"url is a number", `{"name":"a","check":{"type":"http","url":5}}`},
		{"method is a number", `{"name":"a","check":{"type":"http","method":5}}`},
		{"headers is an object", `{"name":"a","check":{"type":"http","headers":{}}}`},
		{"header name is a number", `{"name":"a","check":{"type":"http","headers":[{"name":5}]}}`},
		{"query param value is a list", `{"name":"a","check":{"type":"http","query_params":[{"name":"a","value":[]}]}}`},
		{"body is a string", `{"name":"a","check":{"type":"http","body":"text"}}`},
		{"certificate check is a boolean", `{"name":"a","check":{"type":"http","certificate_check":true}}`},
		{"min days left is a string", `{"name":"a","check":{"type":"http","certificate_check":{"enabled":true,"min_days_left":"5"}}}`},
		{"ignore errors is a string", `{"name":"a","check":{"type":"http","ignore_certificate_errors":"yes"}}`},
		{"rule value is a number", `{"name":"a",` + httpCheck + `,"json_rules":[{"field":"a","failing_value":1}]}}`},
		{"rule value is a list", `{"name":"a",` + httpCheck + `,"json_rules":[{"field":"a","failing_value":["x"]}]}}`},
		{"rule value is an object", `{"name":"a",` + httpCheck + `,"json_rules":[{"field":"a","failing_value":{}}]}}`},
		{"port is a string", `{"name":"a","check":{"type":"tcp","host":"h","port":"80"}}`},
		{"port is 1.5", `{"name":"a","check":{"type":"tcp","host":"h","port":1.5}}`},
		{"port is 80.0", `{"name":"a","check":{"type":"tcp","host":"h","port":80.0}}`},
		{"port overflows an integer", `{"name":"a","check":{"type":"tcp","host":"h","port":99999999999999999999}}`},
		{"host is a number", `{"name":"a","check":{"type":"tcp","host":5,"port":1}}`},
		{"name is a number", `{"name":5}`},
		{"alerts_enabled is a string", `{"name":"a","alerts_enabled":"yes"}`},
		{"timeout is a string", `{"name":"a","settings":{"timeout_seconds":"10"}}`},
		{"interval is 1.5", `{"name":"a","settings":{"check_interval_seconds":1.5}}`},
		{"message is a number", `{"name":"a","unhealthy_message":5}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			spy := &serviceSpy{view: minimalHTTPView()}
			e := newRouter(t, routerOptions{services: spy})

			res := postService(e, tc.body)

			require.Equal(t, http.StatusBadRequest, res.StatusCode)
			testutil.AssertConforms(t, "createService", res)
			assert.Equal(t, "malformed_request", problemCode(t, res))
			assert.Empty(t, spy.inputs, "the usecase is not called")
		})
	}
}

func TestToAPIService_StateMapping(t *testing.T) {
	zone := time.FixedZone("UTC+5", 5*3600)
	checked := time.Date(2026, 5, 6, 12, 0, 0, 0, zone)
	changed := time.Date(2026, 5, 6, 11, 0, 0, 0, zone)
	unhealthy := func(code domain.FailureCode, httpStatus *int, field *string) domain.ServiceState {
		return domain.ServiceState{Status: domain.StatusUnhealthy, LastCheckedAt: &checked, LastStatusChangeAt: &changed,
			FailureCode: &code, FailureHTTPStatus: httpStatus, FailureJSONRuleField: field}
	}
	const times = `"last_checked_at":"2026-05-06T07:00:00Z","last_status_change_at":"2026-05-06T06:00:00Z"`
	tests := []struct {
		name   string
		state  domain.ServiceState
		paused bool
		want   string
	}{
		{"healthy renders times in UTC", domain.ServiceState{Status: domain.StatusHealthy, LastCheckedAt: &checked, LastStatusChangeAt: &changed},
			false, `{"status":"healthy",` + times + `,"last_failure_reason":null}`},
		{"not yet checked has null times", domain.ServiceState{Status: domain.StatusNotYetChecked},
			false, stateNotYetChecked},
		{"non 2xx has the status code", unhealthy(domain.FailureNon2xxStatus, ptr(503), nil),
			false, `{"status":"unhealthy",` + times + `,"last_failure_reason":{"code":"non_2xx_status","http_status":503}}`},
		{"json rule has the field", unhealthy(domain.FailureJSONRuleMatched, nil, ptr("data.ok")),
			false, `{"status":"unhealthy",` + times + `,"last_failure_reason":{"code":"json_rule_matched","json_rule_field":"data.ok"}}`},
		{"timed out has neither", unhealthy(domain.FailureTimedOut, ptr(500), ptr("stray")),
			false, `{"status":"unhealthy",` + times + `,"last_failure_reason":{"code":"timed_out"}}`},
		{"non 2xx without a status code omits it", unhealthy(domain.FailureNon2xxStatus, nil, nil),
			false, `{"status":"unhealthy",` + times + `,"last_failure_reason":{"code":"non_2xx_status"}}`},
		{"json rule without a field omits it", unhealthy(domain.FailureJSONRuleMatched, nil, nil),
			false, `{"status":"unhealthy",` + times + `,"last_failure_reason":{"code":"json_rule_matched"}}`},
		{"unhealthy without a code has a null reason", domain.ServiceState{Status: domain.StatusUnhealthy, LastCheckedAt: &checked, LastStatusChangeAt: &changed},
			false, `{"status":"unhealthy",` + times + `,"last_failure_reason":null}`},
		{"a stray failure code on a healthy service is not returned", func() domain.ServiceState {
			st := unhealthy(domain.FailureNon2xxStatus, ptr(503), nil)
			st.Status = domain.StatusHealthy
			return st
		}(), false, `{"status":"healthy",` + times + `,"last_failure_reason":null}`},
		{"paused keeps its stored status and reason", unhealthy(domain.FailureNon2xxStatus, ptr(502), nil),
			true, `{"status":"unhealthy",` + times + `,"last_failure_reason":{"code":"non_2xx_status","http_status":502}}`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			view := minimalHTTPView()
			view.State.Status, view.State.LastCheckedAt, view.State.LastStatusChangeAt = tc.state.Status, tc.state.LastCheckedAt, tc.state.LastStatusChangeAt
			view.State.FailureCode, view.State.FailureHTTPStatus, view.State.FailureJSONRuleField = tc.state.FailureCode, tc.state.FailureHTTPStatus, tc.state.FailureJSONRuleField
			view.Service.Paused = tc.paused
			e := newRouter(t, routerOptions{services: &serviceSpy{views: []domain.ServiceView{view}}})

			res := getServices(e)

			require.Equal(t, http.StatusOK, res.StatusCode)
			testutil.AssertConforms(t, "listServices", res)
			var items []struct {
				Paused bool            `json:"paused"`
				State  json.RawMessage `json:"state"`
			}
			require.NoError(t, json.Unmarshal([]byte(readBody(t, res)), &items))
			require.Len(t, items, 1)
			assert.JSONEq(t, tc.want, string(items[0].State))
			assert.Equal(t, tc.paused, items[0].Paused)
		})
	}
}

func TestToServiceTestInput(t *testing.T) {
	check := domain.CheckInput{Type: "tcp", TCP: domain.TCPCheckInput{Host: "h", Port: 80}}
	tests := []struct {
		name string
		body string
		want domain.ServiceTestInput
	}{
		{"timeout from settings", `{"check":{"type":"tcp","host":"h","port":80},"settings":{"timeout_seconds":9}}`,
			domain.ServiceTestInput{Check: check, TimeoutSeconds: ptr(9)}},
		{"no settings is a nil timeout", tcpTestBody, domain.ServiceTestInput{Check: check}},
		{"other settings are not mapped", `{"check":{"type":"tcp","host":"h","port":80},"settings":{"check_interval_seconds":1,"retry_count":4,"retry_interval_seconds":5}}`,
			domain.ServiceTestInput{Check: check}},
		{"timeout among other settings", `{"check":{"type":"tcp","host":"h","port":80},"settings":{"check_interval_seconds":1,"timeout_seconds":3,"retry_count":4}}`,
			domain.ServiceTestInput{Check: check, TimeoutSeconds: ptr(3)}},
		{"a missing check is left to validation", `{}`, domain.ServiceTestInput{}},
		{"an unknown type is left to validation", `{"check":{"type":"udp"}}`, domain.ServiceTestInput{Check: domain.CheckInput{Type: "udp"}}},
		{"an http check with every field", `{"check":{"type":"http","method":"POST","url":"https://x/y",
			"query_params":[{"name":"a","value":"1"}],"headers":[{"name":"H","value":"v"}],
			"body":{"type":"text","content":"hi"},"json_rules":[{"field":"ok","failing_value":false}],
			"json_rule_mode":"all","certificate_check":{"enabled":true,"min_days_left":14},"ignore_certificate_errors":true},
			"settings":{"timeout_seconds":6}}`,
			domain.ServiceTestInput{TimeoutSeconds: ptr(6), Check: domain.CheckInput{Type: "http", HTTP: domain.HTTPCheckInput{
				Method: "POST", URL: "https://x/y",
				QueryParams: []domain.NameValue{{Name: "a", Value: "1"}},
				Headers:     []domain.NameValue{{Name: "H", Value: "v"}},
				BodyType:    "text", BodyContent: "hi",
				JSONRules:    []domain.JSONRule{{Field: "ok", FailingValue: false}},
				JSONRuleMode: "all", CertificateCheckEnabled: true, CertMinDaysLeft: ptr(14), IgnoreCertificateErrors: true,
			}}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			spy := &checkTesterSpy{result: domain.ServiceTestResult{Healthy: true}}

			res := postServiceTest(checkRouter(t, spy), tt.body)

			require.Equal(t, http.StatusOK, res.StatusCode)
			assert.Equal(t, []domain.ServiceTestInput{tt.want}, spy.inputs)
		})
	}
}
