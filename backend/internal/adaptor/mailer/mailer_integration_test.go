//go:build integration

package mailer_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/adaptor/mailer"
	"monitory/internal/domain"
)

const mailpitAPI = "http://localhost:8025/api/v1"

type mailpitAddress struct {
	Address string `json:"Address"`
}

type mailpitSummary struct {
	ID      string           `json:"ID"`
	From    mailpitAddress   `json:"From"`
	To      []mailpitAddress `json:"To"`
	Subject string           `json:"Subject"`
}

func TestMailpit_DeliversTheAlert(t *testing.T) {
	client := &http.Client{Timeout: 5 * time.Second}
	do := func(method, path string) *http.Response {
		req, err := http.NewRequestWithContext(t.Context(), method, mailpitAPI+path, http.NoBody)
		require.NoError(t, err)
		resp, err := client.Do(req)
		require.NoError(t, err)
		t.Cleanup(func() { _ = resp.Body.Close() })
		return resp
	}
	require.Equal(t, http.StatusOK, do(http.MethodDelete, "/messages").StatusCode)

	m, err := mailer.New(mailer.Config{Host: "localhost", Port: 1025, TLS: "none", From: "alerts@monitory.test"})
	require.NoError(t, err)
	alert := domain.Alert{
		ServiceID: "svc-1", ServiceName: "API", Status: domain.AlertUnhealthy,
		ChangedAt: time.Date(2026, 11, 18, 14, 5, 0, 0, time.UTC), Message: "It is down.",
	}

	require.NoError(t, m.SendEmail(t.Context(), "integration-recipient@example.com", alert))

	var list struct {
		Total    int              `json:"total"`
		Messages []mailpitSummary `json:"messages"`
	}
	require.NoError(t, json.NewDecoder(do(http.MethodGet, "/messages").Body).Decode(&list))
	require.Equal(t, 1, list.Total)
	got := list.Messages[0]
	assert.Equal(t, "alerts@monitory.test", got.From.Address)
	require.Len(t, got.To, 1)
	assert.Equal(t, "integration-recipient@example.com", got.To[0].Address)
	assert.Equal(t, "API is unhealthy", got.Subject)

	var full struct {
		Text string `json:"Text"`
	}
	require.NoError(t, json.NewDecoder(do(http.MethodGet, "/message/"+got.ID).Body).Decode(&full))
	assert.Equal(t, "Service: API\nStatus: Unhealthy\nTime: 2026-11-18 14:05 UTC\nIt is down.", normalize(full.Text))
}

// normalize turns line ends to "\n" and drops the trailing newlines Mailpit may add.
func normalize(s string) string {
	out := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '\r' {
			continue
		}
		out = append(out, s[i])
	}
	for len(out) > 0 && out[len(out)-1] == '\n' {
		out = out[:len(out)-1]
	}
	return string(out)
}
