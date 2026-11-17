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

func emailRow(id, address string) domain.Target {
	return domain.Target{
		ID: id, ServiceID: "s1", Type: domain.TargetTypeEmail, Value: address,
		Headers: []domain.NameValue{}, CreatedAt: createdAt, UpdatedAt: createdAt,
	}
}

func webhookRow(id, url string) domain.Target {
	return domain.Target{
		ID: id, ServiceID: "s1", Type: domain.TargetTypeWebhook, Value: url, Name: "Pager",
		Headers: []domain.NameValue{{Name: "K", Value: "v"}}, CreatedAt: createdAt, UpdatedAt: createdAt,
	}
}

func getTargets(e *echo.Echo, serviceID string, opts ...requestOption) *http.Response {
	opts = append([]requestOption{withSession}, opts...)
	return do(e, http.MethodGet, "/api/services/"+serviceID+"/targets", "", opts...)
}

func postTarget(e *echo.Echo, serviceID, body string, opts ...requestOption) *http.Response {
	opts = append([]requestOption{withSession, withCSRF, withJSON}, opts...)
	return do(e, http.MethodPost, "/api/services/"+serviceID+"/targets", body, opts...)
}

func putTarget(e *echo.Echo, serviceID, targetID, body string, opts ...requestOption) *http.Response {
	opts = append([]requestOption{withSession, withCSRF, withJSON}, opts...)
	return do(e, http.MethodPut, "/api/services/"+serviceID+"/targets/"+targetID, body, opts...)
}

func deleteTarget(e *echo.Echo, serviceID, targetID string, opts ...requestOption) *http.Response {
	opts = append([]requestOption{withSession, withCSRF}, opts...)
	return do(e, http.MethodDelete, "/api/services/"+serviceID+"/targets/"+targetID, "", opts...)
}

const (
	emailBody   = `{"type":"email","address":"a@x.io"}`
	webhookJSON = `{"id":"t2","type":"webhook","name":"Pager","url":"https://h","headers":[{"name":"K","value":"v"}],"last_delivery_failed":false}`
	emailJSON   = `{"id":"t1","type":"email","name":"","address":"a@x.io","last_delivery_failed":false}`
)

func TestListTargets_Answers200WithTheList(t *testing.T) {
	spy := &targetSpy{targets: []domain.Target{emailRow("t1", "a@x.io"), webhookRow("t2", "https://h")}}
	e := newRouter(t, routerOptions{targets: spy})

	res := getTargets(e, "s1")

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "listTargets", res)
	assert.JSONEq(t, `[`+emailJSON+`,`+webhookJSON+`]`, readBody(t, res))
	assert.Equal(t, []string{"s1"}, spy.listed)
}

func TestListTargets_NoTargetsIsAnEmptyList(t *testing.T) {
	e := newRouter(t, routerOptions{targets: &targetSpy{}})
	res := getTargets(e, "s1")
	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "listTargets", res)
	assert.Equal(t, "[]", strings.TrimSpace(readBody(t, res)))
}

func TestCreateTarget_Answers201WithTheSavedTarget(t *testing.T) {
	e := newRouter(t, routerOptions{targets: &targetSpy{target: webhookRow("t2", "https://h")}})
	res := postTarget(e, "s1", `{"type":"webhook","url":"https://h"}`)
	require.Equal(t, http.StatusCreated, res.StatusCode)
	testutil.AssertConforms(t, "createTarget", res)
	assert.JSONEq(t, webhookJSON, readBody(t, res))
}

func TestUpdateTarget_Answers200WithTheStoredTarget(t *testing.T) {
	stored := emailRow("t1", "a@x.io")
	stored.LastDeliveryFailed = true
	spy := &targetSpy{target: stored}
	e := newRouter(t, routerOptions{targets: spy})

	res := putTarget(e, "s1", "t1", emailBody)

	require.Equal(t, http.StatusOK, res.StatusCode)
	testutil.AssertConforms(t, "updateTarget", res)
	assert.JSONEq(t, `{"id":"t1","type":"email","name":"","address":"a@x.io","last_delivery_failed":true}`, readBody(t, res))
	assert.Equal(t, []string{"s1/t1"}, spy.updated)
}

func TestDeleteTarget_Answers204WithAnEmptyBody(t *testing.T) {
	spy := &targetSpy{}
	e := newRouter(t, routerOptions{targets: spy})

	res := deleteTarget(e, "s1", "t1")

	require.Equal(t, http.StatusNoContent, res.StatusCode)
	testutil.AssertConforms(t, "deleteTarget", res)
	assert.Empty(t, readBody(t, res))
	assert.Equal(t, []string{"s1/t1"}, spy.deleted)
}

func TestCreateAndUpdateTarget_ValidationErrorsAre422(t *testing.T) {
	fields := []domain.FieldError{
		{Field: "address", Code: domain.FieldErrorInvalidFormat, Message: "Enter a valid email address."},
		{Field: "url", Code: domain.FieldErrorRequired, Message: "Enter a URL that starts with http:// or https://."},
		{Field: "headers[0].name", Code: domain.FieldErrorRequired, Message: "Enter a header name."},
	}
	want := `{"title":"Validation failed","status":422,"code":"validation_failed","errors":[
		{"field":"address","code":"invalid_format","message":"Enter a valid email address."},
		{"field":"url","code":"required","message":"Enter a URL that starts with http:// or https://."},
		{"field":"headers[0].name","code":"required","message":"Enter a header name."}]}`
	for _, body := range []string{`{}`, `{"type":"ftp"}`, `{"type":"email","address":"x"}`} {
		spy := &targetSpy{err: domain.ValidationError{Fields: fields}}
		e := newRouter(t, routerOptions{targets: spy})

		res := postTarget(e, "s1", body)
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode, body)
		testutil.AssertConforms(t, "createTarget", res)
		assert.JSONEq(t, want, readBody(t, res))

		res = putTarget(e, "s1", "t1", body)
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode, body)
		testutil.AssertConforms(t, "updateTarget", res)
		assert.JSONEq(t, want, readBody(t, res))
	}
}

func TestCreateAndUpdateTarget_MalformedBodiesAre400AndNeverReachTheSpy(t *testing.T) {
	for _, body := range []string{`{"type":"email","address":5}`, `{"type":"webhook","url":"https://h","headers":"x"}`, `not json`} {
		spy := &targetSpy{target: emailRow("t1", "a@x.io")}
		e := newRouter(t, routerOptions{targets: spy})

		res := postTarget(e, "s1", body)
		require.Equal(t, http.StatusBadRequest, res.StatusCode, body)
		testutil.AssertConforms(t, "createTarget", res)
		assert.Contains(t, readBody(t, res), `"code":"malformed_request"`)

		res = putTarget(e, "s1", "t1", body)
		require.Equal(t, http.StatusBadRequest, res.StatusCode, body)
		testutil.AssertConforms(t, "updateTarget", res)

		assert.Empty(t, spy.inputs, "nothing is saved: %s", body)
	}
}

func TestTargets_ErrorsMapToTheirCodes(t *testing.T) {
	notFound := `{"title":"Not found","status":404,"code":"not_found"}`
	full := `{"title":"Alert list full","status":409,"code":"alert_list_full"}`
	dup := `{"title":"Contact already in the list","status":409,"code":"target_duplicate"}`
	tests := []struct {
		name   string
		op     string
		err    error
		status int
		body   string
		call   func(e *echo.Echo) *http.Response
	}{
		{"list not found", "listTargets", domain.ErrNotFound, 404, notFound, func(e *echo.Echo) *http.Response { return getTargets(e, "s1") }},
		{"create not found", "createTarget", domain.ErrNotFound, 404, notFound, func(e *echo.Echo) *http.Response { return postTarget(e, "s1", emailBody) }},
		{"update not found", "updateTarget", domain.ErrNotFound, 404, notFound, func(e *echo.Echo) *http.Response { return putTarget(e, "s1", "t1", emailBody) }},
		{"delete not found", "deleteTarget", domain.ErrNotFound, 404, notFound, func(e *echo.Echo) *http.Response { return deleteTarget(e, "s1", "t1") }},
		{"create full", "createTarget", domain.ErrAlertListFull, 409, full, func(e *echo.Echo) *http.Response { return postTarget(e, "s1", emailBody) }},
		{"create duplicate", "createTarget", domain.ErrTargetDuplicate, 409, dup, func(e *echo.Echo) *http.Response { return postTarget(e, "s1", emailBody) }},
		{"update duplicate", "updateTarget", domain.ErrTargetDuplicate, 409, dup, func(e *echo.Echo) *http.Response { return putTarget(e, "s1", "t1", emailBody) }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			e := newRouter(t, routerOptions{targets: &targetSpy{err: tc.err}})
			res := tc.call(e)
			require.Equal(t, tc.status, res.StatusCode)
			testutil.AssertConforms(t, tc.op, res)
			assert.JSONEq(t, tc.body, readBody(t, res))
		})
	}
}

func TestTargets_UnexpectedErrorHidesItsText(t *testing.T) {
	e := newRouter(t, routerOptions{targets: &targetSpy{err: errors.New("disk I/O error at /data/monitory.db")}})
	res := postTarget(e, "s1", emailBody)
	require.Equal(t, http.StatusInternalServerError, res.StatusCode)
	testutil.AssertConforms(t, "createTarget", res)
	body := readBody(t, res)
	assert.Contains(t, body, `"code":"internal_error"`)
	assert.NotContains(t, body, "disk")
}

func TestTargets_SuccessLogsOneLineWithIDsOnly(t *testing.T) {
	const secretBody = `{"type":"webhook","name":"my-secret-name","url":"https://secret.example/hook","headers":[{"name":"Authorization","value":"Bearer s3cret"}],"address":"private@example.com"}`
	hook := webhookRow("t2", "https://secret.example/hook")
	hook.Name = "my-secret-name"
	hook.Headers = []domain.NameValue{{Name: "Authorization", Value: "Bearer s3cret"}}
	for _, tc := range []struct {
		msg  string
		call func(e *echo.Echo) *http.Response
	}{
		{"target added", func(e *echo.Echo) *http.Response { return postTarget(e, "s1", secretBody) }},
		{"target updated", func(e *echo.Echo) *http.Response { return putTarget(e, "s1", "t2", secretBody) }},
		{"target deleted", func(e *echo.Echo) *http.Response { return deleteTarget(e, "s1", "t2") }},
	} {
		t.Run(tc.msg, func(t *testing.T) {
			var logs bytes.Buffer
			e := newRouter(t, routerOptions{targets: &targetSpy{target: hook}, logOutput: &logs})

			res := tc.call(e)

			require.Less(t, res.StatusCode, 300)
			lines := strings.Split(strings.TrimSpace(logs.String()), "\n")
			require.Len(t, lines, 1)
			_, attrs, found := strings.Cut(lines[0], `msg="`+tc.msg+`" `)
			require.True(t, found, "line: %s", lines[0])
			assert.Equal(t, "service_id=s1 target_id=t2", attrs)
			for _, secret := range []string{"secret", "Authorization", "private@"} {
				assert.NotContains(t, logs.String(), secret)
			}
		})
	}
}

func TestTargets_GateFailuresNeverReachTheSpy(t *testing.T) {
	spy := &targetSpy{target: emailRow("t1", "a@x.io")}
	e := newRouter(t, routerOptions{targets: spy})

	assert.Equal(t, http.StatusUnauthorized, do(e, http.MethodGet, "/api/services/s1/targets", "").StatusCode)
	assert.Equal(t, http.StatusForbidden, do(e, http.MethodPost, "/api/services/s1/targets", emailBody, withSession, withJSON).StatusCode)
	assert.Equal(t, http.StatusForbidden, do(e, http.MethodPut, "/api/services/s1/targets/t1", emailBody, withSession, withJSON).StatusCode)
	assert.Equal(t, http.StatusForbidden, do(e, http.MethodDelete, "/api/services/s1/targets/t1", "", withSession).StatusCode)
	assert.Equal(t, http.StatusUnsupportedMediaType, do(e, http.MethodPost, "/api/services/s1/targets", emailBody, withSession, withCSRF).StatusCode)
	assert.Empty(t, spy.listed)
	assert.Empty(t, spy.inputs)
	assert.Empty(t, spy.deleted)

	// The baseline: with the session and the token the same request reaches it.
	require.Equal(t, http.StatusCreated, postTarget(e, "s1", emailBody).StatusCode)
	assert.Len(t, spy.inputs, 1)
}
