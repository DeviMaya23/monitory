package mailer_test

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"mime"
	"mime/quotedprintable"
	"net"
	netmail "net/mail"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/adaptor/mailer"
	"monitory/internal/domain"
	"monitory/internal/testutil"
)

const (
	notConfiguredText = "no SMTP account configured"
	notAcceptedText   = "the SMTP server did not accept the message"
)

var changedAt = time.Date(2026, 11, 18, 14, 5, 0, 0, time.UTC)

func alertFor(status domain.AlertStatus) domain.Alert {
	return domain.Alert{ServiceID: "svc-id-9f3a", ServiceName: "API", Status: status, ChangedAt: changedAt, Message: "It is down."}
}

func newMailer(t *testing.T, s *testutil.SMTPServer, mutate func(*mailer.Config)) *mailer.Mailer {
	t.Helper()
	cfg := mailer.Config{Host: s.Host, Port: s.Port, TLS: "none", From: "alerts@monitory.test", AttemptTimeout: 2 * time.Second}
	if mutate != nil {
		mutate(&cfg)
	}
	m, err := mailer.New(cfg)
	require.NoError(t, err)
	return m
}

// received is what a server got, decoded: the header encoding and the body's transfer
// encoding undone, line ends turned to "\n".
type received struct {
	from, to string
	subject  string
	headers  netmail.Header
	body     string
}

func decode(t *testing.T, m testutil.SMTPMessage) received {
	t.Helper()
	require.Len(t, m.To, 1)
	parsed, err := netmail.ReadMessage(strings.NewReader(m.Data))
	require.NoError(t, err)
	var dec mime.WordDecoder
	subject, err := dec.DecodeHeader(parsed.Header.Get("Subject"))
	require.NoError(t, err)

	raw, err := io.ReadAll(parsed.Body)
	require.NoError(t, err)
	var body []byte
	switch strings.ToLower(parsed.Header.Get("Content-Transfer-Encoding")) {
	case "quoted-printable":
		body, err = io.ReadAll(quotedprintable.NewReader(strings.NewReader(string(raw))))
		require.NoError(t, err)
	case "base64":
		joined := strings.ReplaceAll(strings.ReplaceAll(string(raw), "\r\n", ""), "\n", "")
		body, err = base64.StdEncoding.DecodeString(joined)
		require.NoError(t, err)
	default:
		body = raw
	}
	return received{
		from: m.From, to: m.To[0], subject: subject, headers: parsed.Header,
		body: strings.ReplaceAll(string(body), "\r\n", "\n"),
	}
}

func sendOne(t *testing.T, alert domain.Alert) received {
	t.Helper()
	s := testutil.NewSMTPServer(t, testutil.SMTPOptions{})
	require.NoError(t, newMailer(t, s, nil).SendEmail(t.Context(), "ops@example.com", alert))
	msgs := s.Messages()
	require.Len(t, msgs, 1)
	return decode(t, msgs[0])
}

func TestSendEmail_NotConfigured(t *testing.T) {
	s := testutil.NewSMTPServer(t, testutil.SMTPOptions{})
	m := newMailer(t, s, func(c *mailer.Config) { c.Host = "" })

	err := m.SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy))

	require.ErrorIs(t, err, mailer.ErrNotConfigured)
	assert.Equal(t, notConfiguredText, err.Error())
	assert.Zero(t, s.Connections())

	// Baseline: the same server with a host gets the connection.
	require.NoError(t, newMailer(t, s, nil).SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy)))
	assert.Equal(t, 1, s.Connections())
}

func TestSendEmail_Content(t *testing.T) {
	tests := []struct {
		name        string
		status      domain.AlertStatus
		wantSubject string
		wantStatus  string
	}{
		{"unhealthy", domain.AlertUnhealthy, "API is unhealthy", "Status: Unhealthy"},
		{"recovery", domain.AlertHealthy, "API is healthy again", "Status: Healthy"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sendOne(t, alertFor(tt.status))

			assert.Equal(t, "alerts@monitory.test", got.from)
			assert.Equal(t, "ops@example.com", got.to)
			assert.Equal(t, tt.wantSubject, got.subject)
			assert.Equal(t, "Service: API\n"+tt.wantStatus+"\nTime: 2026-11-18 14:05 UTC\nIt is down.\n", got.body)
			contentType := strings.ToLower(got.headers.Get("Content-Type"))
			assert.Contains(t, contentType, "text/plain")
			assert.Contains(t, contentType, "utf-8")
		})
	}
}

func TestSendEmail_TimeIsUTCWithoutSeconds(t *testing.T) {
	t.Run("seconds are dropped, not rounded", func(t *testing.T) {
		alert := alertFor(domain.AlertUnhealthy)
		alert.ChangedAt = time.Date(2026, 11, 18, 14, 5, 59, 0, time.UTC)
		assert.Contains(t, sendOne(t, alert).body, "\nTime: 2026-11-18 14:05 UTC\n")
	})
	t.Run("another zone shows the UTC time of the same instant", func(t *testing.T) {
		alert := alertFor(domain.AlertUnhealthy)
		alert.ChangedAt = time.Date(2026, 11, 18, 21, 5, 0, 0, time.FixedZone("UTC+7", 7*3600))
		assert.Contains(t, sendOne(t, alert).body, "\nTime: 2026-11-18 14:05 UTC\n")
	})
}

func TestSendEmail_LineBreaksInTheNameCannotInjectAHeader(t *testing.T) {
	alert := alertFor(domain.AlertUnhealthy)
	alert.ServiceName = "A\r\nBcc: evil@example.com\nB"

	got := sendOne(t, alert)

	assert.Equal(t, "A  Bcc: evil@example.com B is unhealthy", got.subject)
	lines := strings.Split(got.body, "\n")
	require.Len(t, lines, 5, "four lines and the empty one after the final newline")
	assert.Equal(t, "Service: A  Bcc: evil@example.com B", lines[0])
	assert.Empty(t, got.headers.Get("Bcc"))
}

func TestSendEmail_NonASCIIArrivesIntact(t *testing.T) {
	alert := alertFor(domain.AlertUnhealthy)
	alert.ServiceName = "Café – 監視 ✓"
	alert.Message = "Ça ne répond plus — 停止しました"

	got := sendOne(t, alert)

	assert.Equal(t, "Café – 監視 ✓ is unhealthy", got.subject)
	assert.Equal(t, "Service: Café – 監視 ✓\nStatus: Unhealthy\nTime: 2026-11-18 14:05 UTC\nÇa ne répond plus — 停止しました\n", got.body)
}

func TestSendEmail_MessageKeepsItsLineBreaks(t *testing.T) {
	alert := alertFor(domain.AlertUnhealthy)
	alert.Message = "line one\nline two"

	assert.Equal(t, "Service: API\nStatus: Unhealthy\nTime: 2026-11-18 14:05 UTC\nline one\nline two\n", sendOne(t, alert).body)
}

func TestSendEmail_HoldsOnlyTheFourValues(t *testing.T) {
	s := testutil.NewSMTPServer(t, testutil.SMTPOptions{})
	require.NoError(t, newMailer(t, s, nil).SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy)))
	msgs := s.Messages()
	require.Len(t, msgs, 1)

	got := decode(t, msgs[0])

	assert.NotContains(t, msgs[0].Data, "svc-id-9f3a")
	assert.NotContains(t, got.subject+got.body, "svc-id-9f3a")
	for name, values := range got.headers {
		for _, v := range values {
			assert.NotContains(t, v, "svc-id-9f3a", name)
		}
	}
}

func TestSendEmail_MalformedRecipient(t *testing.T) {
	s := testutil.NewSMTPServer(t, testutil.SMTPOptions{})
	m := newMailer(t, s, nil)

	err := m.SendEmail(t.Context(), "not an address", alertFor(domain.AlertUnhealthy))

	require.ErrorIs(t, err, mailer.ErrNotAccepted)
	assert.Equal(t, notAcceptedText, err.Error())
	assert.Empty(t, s.Messages())
}

func TestSendEmail_Failures(t *testing.T) {
	const to = "private.person@example.com"
	closedPort := func(t *testing.T) int {
		l, err := net.Listen("tcp", "127.0.0.1:0")
		require.NoError(t, err)
		port := l.Addr().(*net.TCPAddr).Port
		require.NoError(t, l.Close())
		return port
	}
	tests := []struct {
		name   string
		opts   testutil.SMTPOptions
		mutate func(t *testing.T, c *mailer.Config)
	}{
		{"the server rejects the recipient", testutil.SMTPOptions{RejectRecipient: true}, nil},
		{"the server closes the connection at once", testutil.SMTPOptions{CloseAtConnect: true}, nil},
		{"nothing listens on the port", testutil.SMTPOptions{}, func(t *testing.T, c *mailer.Config) { c.Port = closedPort(t) }},
		{"the greeting is later than the attempt timeout", testutil.SMTPOptions{GreetingDelay: 2 * time.Second},
			func(_ *testing.T, c *mailer.Config) { c.AttemptTimeout = 150 * time.Millisecond }},
		{"starttls against a server that does not offer it", testutil.SMTPOptions{},
			func(_ *testing.T, c *mailer.Config) { c.TLS = "starttls" }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := testutil.NewSMTPServer(t, tt.opts)
			m := newMailer(t, s, func(c *mailer.Config) {
				if tt.mutate != nil {
					tt.mutate(t, c)
				}
			})

			err := m.SendEmail(t.Context(), to, alertFor(domain.AlertUnhealthy))

			require.ErrorIs(t, err, mailer.ErrNotAccepted)
			assert.Equal(t, notAcceptedText, err.Error())
			assert.NotContains(t, err.Error(), to)
			cause := errors.Unwrap(err)
			require.Error(t, cause, "the cause stays reachable")
			assert.NotEqual(t, err.Error(), cause.Error())
			assert.Empty(t, s.Messages())
		})
	}
}

func TestSendEmail_ContextCancelledWhileTheGreetingIsDelayed(t *testing.T) {
	s := testutil.NewSMTPServer(t, testutil.SMTPOptions{GreetingDelay: 5 * time.Second})
	m := newMailer(t, s, func(c *mailer.Config) { c.AttemptTimeout = 10 * time.Second })
	ctx, cancel := context.WithCancel(t.Context())
	errs := make(chan error, 1)
	go func() { errs <- m.SendEmail(ctx, "ops@example.com", alertFor(domain.AlertUnhealthy)) }()
	require.Eventually(t, func() bool { return s.Connections() == 1 }, 2*time.Second, 5*time.Millisecond)

	cancel()

	select {
	case err := <-errs:
		require.ErrorIs(t, err, context.Canceled)
		assert.NotErrorIs(t, err, mailer.ErrNotAccepted)
	case <-time.After(2 * time.Second):
		t.Fatal("the send did not end when its context was cancelled")
	}
}

func TestSendEmail_Authentication(t *testing.T) {
	opts := testutil.SMTPOptions{Username: "user", Password: "secret"}
	with := func(user, pass string) func(*mailer.Config) {
		return func(c *mailer.Config) { c.Username, c.Password = user, pass }
	}

	t.Run("the right password is accepted", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, opts)
		require.NoError(t, newMailer(t, s, with("user", "secret")).SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy)))
		assert.Len(t, s.Messages(), 1)
		assert.Equal(t, 1, s.AuthCommands())
	})
	t.Run("a wrong password is rejected", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, opts)
		err := newMailer(t, s, with("user", "wrong")).SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy))
		require.ErrorIs(t, err, mailer.ErrNotAccepted)
		assert.Empty(t, s.Messages())
	})
	t.Run("an empty username sends no AUTH", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{})
		require.NoError(t, newMailer(t, s, nil).SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy)))
		assert.Zero(t, s.AuthCommands())
	})
}

func TestNew_UnknownTLSMode(t *testing.T) {
	_, err := mailer.New(mailer.Config{Host: "h", Port: 25, TLS: "ssl", From: "a@b"})
	require.Error(t, err)

	_, err = mailer.New(mailer.Config{Host: "h", Port: 25, TLS: "none", From: "a@b"})
	require.NoError(t, err)
}

func TestSendEmail_ConcurrentSends(t *testing.T) {
	s := testutil.NewSMTPServer(t, testutil.SMTPOptions{})
	m := newMailer(t, s, nil)
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := range errs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs[i] = m.SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy))
		}()
	}
	wg.Wait()

	assert.NoError(t, errs[0])
	assert.NoError(t, errs[1])
	assert.Len(t, s.Messages(), 2)
}
