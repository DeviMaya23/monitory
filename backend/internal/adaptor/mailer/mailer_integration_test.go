//go:build integration

package mailer_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
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

type mailpitSearch struct {
	Messages []mailpitSummary `json:"messages"`
}

// mailpitRequest sends one request to Mailpit's API under ctx, with an optional JSON body.
func mailpitRequest(ctx context.Context, client *http.Client, method, path, body string) (*http.Response, error) {
	var reader io.Reader = http.NoBody
	if body != "" {
		reader = strings.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, mailpitAPI+path, reader)
	if err != nil {
		return nil, err
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	return client.Do(req)
}

// uniqueRecipient is an address no other run has: a fixed local part and 16 random hex
// characters, so two runs against one Mailpit never see each other's mail.
func uniqueRecipient(t *testing.T) string {
	t.Helper()
	random := make([]byte, 8)
	_, err := rand.Read(random)
	require.NoError(t, err)
	return "integration-" + hex.EncodeToString(random) + "@example.com"
}

func TestMailpit_DeliversTheAlert(t *testing.T) {
	client := &http.Client{Timeout: 5 * time.Second}
	recipient := uniqueRecipient(t)

	do := func(ctx context.Context, method, path, body string) *http.Response {
		resp, err := mailpitRequest(ctx, client, method, path, body)
		require.NoError(t, err)
		t.Cleanup(func() { _ = resp.Body.Close() })
		return resp
	}
	// search lists the messages addressed to this test's recipient, and only those.
	search := func() []mailpitSummary {
		var found mailpitSearch
		resp := do(t.Context(), http.MethodGet, "/search?query="+url.QueryEscape("to:"+recipient), "")
		require.Equal(t, http.StatusOK, resp.StatusCode)
		require.NoError(t, json.NewDecoder(resp.Body).Decode(&found))
		return found.Messages
	}

	m, err := mailer.New(mailer.Config{Host: "localhost", Port: 1025, TLS: "none", From: "alerts@monitory.test"})
	require.NoError(t, err)
	alert := domain.Alert{
		ServiceID: "svc-1", ServiceName: "API", Status: domain.AlertUnhealthy,
		ChangedAt: time.Date(2026, 11, 18, 14, 5, 0, 0, time.UTC), Message: "It is down.",
	}

	require.NoError(t, m.SendEmail(t.Context(), recipient, alert))

	// Removes only this test's message. t.Context() is cancelled before cleanups run,
	// so the request has a context of its own.
	var id string
	deleteOwn := func(ctx context.Context) *http.Response {
		resp, err := mailpitRequest(ctx, client, http.MethodDelete, "/messages", `{"IDs":["`+id+`"]}`)
		if err != nil {
			return nil
		}
		return resp
	}
	t.Cleanup(func() {
		if id == "" {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if resp := deleteOwn(ctx); resp != nil {
			_ = resp.Body.Close()
		}
	})

	messages := search()
	require.Len(t, messages, 1)
	got := messages[0]
	id = got.ID
	assert.Equal(t, "alerts@monitory.test", got.From.Address)
	require.Len(t, got.To, 1)
	assert.Equal(t, recipient, got.To[0].Address)
	assert.Equal(t, "API is unhealthy", got.Subject)

	var full struct {
		Text string `json:"Text"`
	}
	require.NoError(t, json.NewDecoder(do(t.Context(), http.MethodGet, "/message/"+got.ID, "").Body).Decode(&full))
	assert.Equal(t, "Service: API\nStatus: Unhealthy\nTime: 2026-11-18 14:05 UTC\nIt is down.", normalize(full.Text))

	resp := deleteOwn(t.Context())
	require.NotNil(t, resp)
	t.Cleanup(func() { _ = resp.Body.Close() })
	require.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Empty(t, search())
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
