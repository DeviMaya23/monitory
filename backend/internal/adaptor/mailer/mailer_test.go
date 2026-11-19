package mailer_test

import (
	"context"
	"crypto/x509"
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

const testMessage = "This is a test alert from Monitory. No service has changed status."

func testAlertFor(name string) domain.Alert {
	return domain.Alert{ServiceID: "svc-id-9f3a", ServiceName: name, Status: domain.AlertTest, ChangedAt: changedAt, Message: testMessage}
}

func TestSendEmail_TestAlert(t *testing.T) {
	got := sendOne(t, testAlertFor("API"))

	assert.Equal(t, "Test alert for API", got.subject)
	assert.Equal(t, "Service: API\nStatus: Test\nTime: 2026-11-18 14:05 UTC\n"+testMessage+"\n", got.body)
}

func TestSendEmail_TestAlertNameIsPlainText(t *testing.T) {
	name := `<b>x</b> "quoted"`

	got := sendOne(t, testAlertFor(name))

	assert.Equal(t, "Test alert for "+name, got.subject)
	assert.Equal(t, "Service: "+name, strings.Split(got.body, "\n")[0])
}

func TestSendEmail_TestAlertNameIsOneLine(t *testing.T) {
	got := sendOne(t, testAlertFor("A\r\nBcc: evil@example.com\nB"))

	assert.Equal(t, "Test alert for A  Bcc: evil@example.com B", got.subject)
	lines := strings.Split(got.body, "\n")
	require.Len(t, lines, 5)
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

// go-mail v0.8.1 negotiates PLAIN and LOGIN only on an encrypted connection. An
// authenticated send that succeeds is tested over "tls" against the fake in TLS mode;
// the cases here pin that the mailer does not send credentials in the clear to get
// around it, and that a wrong password is refused.
func TestSendEmail_Authentication(t *testing.T) {
	t.Run("a username on an unencrypted connection is refused before any credential is sent", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{Username: "user", Password: "secret"})
		m := newMailer(t, s, func(c *mailer.Config) { c.Username, c.Password = "user", "secret" })

		err := m.SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy))

		require.ErrorIs(t, err, mailer.ErrNotAccepted)
		assert.Equal(t, notAcceptedText, err.Error())
		assert.Zero(t, s.AuthCommands())
		assert.Empty(t, s.Messages())
	})
	t.Run("over tls the credentials are accepted", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true, Username: "user", Password: "secret"})
		m := newTLSMailer(t, s, func(c *mailer.Config) { c.Username, c.Password = "user", "secret" })

		require.NoError(t, m.SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy)))

		assert.Positive(t, s.AuthCommands())
		assert.Len(t, s.Messages(), 1)
	})
	t.Run("over tls a wrong password is refused", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true, Username: "user", Password: "secret"})
		m := newTLSMailer(t, s, func(c *mailer.Config) { c.Username, c.Password = "user", "wrong" })

		err := m.SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy))

		require.ErrorIs(t, err, mailer.ErrNotAccepted)
		assert.Equal(t, notAcceptedText, err.Error())
		assert.Positive(t, s.AuthCommands())
		assert.Empty(t, s.Messages())
	})
	t.Run("an empty username sends no AUTH", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{})
		require.NoError(t, newMailer(t, s, nil).SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy)))
		assert.Zero(t, s.AuthCommands())
		assert.Len(t, s.Messages(), 1)
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

func TestSendEmail_LimitsAndSMTPSpecialLines(t *testing.T) {
	tests := []struct {
		name        string
		serviceName string
		message     string
	}{
		{"a 100-character ASCII name", strings.Repeat("n", 100), "It is down."},
		{"a 100-character non-ASCII name", strings.Repeat("監", 100), "It is down."},
		{"a 500-character message with a line break", "API", strings.Repeat("m", 249) + "\n" + strings.Repeat("é", 250)},
		{"a message that is a lone dot line", "API", "before\n.\nafter"},
		{"a message that starts with a dot", "API", ".leading dot"},
		{"a message with CRLF line ends", "API", "one\r\ntwo\r\n.\r\nthree"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			alert := alertFor(domain.AlertUnhealthy)
			alert.ServiceName, alert.Message = tt.serviceName, tt.message

			got := sendOne(t, alert)

			assert.Equal(t, tt.serviceName+" is unhealthy", got.subject)
			wantMessage := strings.ReplaceAll(tt.message, "\r\n", "\n")
			assert.Equal(t, "Service: "+tt.serviceName+"\nStatus: Unhealthy\nTime: 2026-11-18 14:05 UTC\n"+wantMessage+"\n", got.body)
		})
	}
}

// newTLSMailer is a mailer in "tls" mode for a server made with SMTPOptions.TLS, trusting
// that server's certificate.
func newTLSMailer(t *testing.T, s *testutil.SMTPServer, mutate func(*mailer.Config)) *mailer.Mailer {
	t.Helper()
	return newMailer(t, s, func(c *mailer.Config) {
		c.TLS = "tls"
		c.RootCAs = s.Pool()
		if mutate != nil {
			mutate(c)
		}
	})
}

func TestSendEmail_ImplicitTLS(t *testing.T) {
	t.Run("a send succeeds well within the attempt timeout", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true})
		m := newTLSMailer(t, s, func(c *mailer.Config) { c.AttemptTimeout = 200 * time.Millisecond })

		start := time.Now()
		require.NoError(t, m.SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy)))
		assert.Less(t, time.Since(start), 150*time.Millisecond)

		msgs := s.Messages()
		require.Len(t, msgs, 1)
		got := decode(t, msgs[0])
		assert.Equal(t, "alerts@monitory.test", got.from)
		assert.Equal(t, "ops@example.com", got.to)
		assert.Equal(t, "API is unhealthy", got.subject)
		assert.Equal(t, "Service: API\nStatus: Unhealthy\nTime: 2026-11-18 14:05 UTC\nIt is down.\n", got.body)
	})
	t.Run("the send used TLS on one connection", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true})

		require.NoError(t, newTLSMailer(t, s, nil).SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy)))

		assert.Equal(t, 1, s.Connections())
		assert.Equal(t, 1, s.Handshakes())
	})
	t.Run("two concurrent sends each use their own connection", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true})
		m := newTLSMailer(t, s, nil)
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
		assert.Equal(t, 2, s.Connections())
		assert.Equal(t, 2, s.Handshakes())
	})
}

func TestSendEmail_ImplicitTLSVerifiesTheServer(t *testing.T) {
	const to = "private.person@example.com"
	other := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true})
	tests := []struct {
		name   string
		opts   testutil.SMTPOptions
		mutate func(*mailer.Config)
	}{
		{"no RootCAs keeps the system roots", testutil.SMTPOptions{TLS: true}, func(c *mailer.Config) { c.RootCAs = nil }},
		{"a pool of another certificate", testutil.SMTPOptions{TLS: true}, func(c *mailer.Config) { c.RootCAs = other.Pool() }},
		{"a certificate that does not name the host", testutil.SMTPOptions{TLS: true, CertNames: []string{"smtp.example.test"}}, nil},
		{"an empty pool", testutil.SMTPOptions{TLS: true}, func(c *mailer.Config) { c.RootCAs = x509.NewCertPool() }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := testutil.NewSMTPServer(t, tt.opts)
			m := newTLSMailer(t, s, tt.mutate)

			err := m.SendEmail(t.Context(), to, alertFor(domain.AlertUnhealthy))

			require.ErrorIs(t, err, mailer.ErrNotAccepted)
			assert.Equal(t, notAcceptedText, err.Error())
			assert.NotContains(t, err.Error(), to)
			assert.NotContains(t, err.Error(), "certificate")
			assert.Empty(t, s.Messages())
			assert.Zero(t, s.Handshakes())
		})
	}
}

func TestSendEmail_ImplicitTLSModeMismatches(t *testing.T) {
	t.Run("a plain server on a tls mailer fails promptly", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{})
		m := newMailer(t, s, func(c *mailer.Config) { c.TLS = "tls"; c.AttemptTimeout = 2 * time.Second })

		start := time.Now()
		err := m.SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy))

		require.ErrorIs(t, err, mailer.ErrNotAccepted)
		assert.Equal(t, notAcceptedText, err.Error())
		assert.Less(t, time.Since(start), time.Second)
		assert.Empty(t, s.Messages())
	})
	for _, mode := range []string{"none", "starttls"} {
		t.Run("a TLS server on a "+mode+" mailer", func(t *testing.T) {
			s := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true})
			m := newMailer(t, s, func(c *mailer.Config) { c.TLS = mode; c.AttemptTimeout = 200 * time.Millisecond })

			err := m.SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy))

			require.ErrorIs(t, err, mailer.ErrNotAccepted)
			assert.Equal(t, notAcceptedText, err.Error())
			assert.Empty(t, s.Messages())
		})
	}
}

func TestSendEmail_ImplicitTLSStalledHandshake(t *testing.T) {
	t.Run("ends at the attempt timeout", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true, StallHandshake: true})
		m := newTLSMailer(t, s, func(c *mailer.Config) { c.AttemptTimeout = 200 * time.Millisecond })

		start := time.Now()
		err := m.SendEmail(t.Context(), "ops@example.com", alertFor(domain.AlertUnhealthy))

		require.ErrorIs(t, err, mailer.ErrNotAccepted)
		assert.Equal(t, notAcceptedText, err.Error())
		assert.GreaterOrEqual(t, time.Since(start), 150*time.Millisecond)
		assert.Empty(t, s.Messages())
		assert.Zero(t, s.Handshakes())
	})
	t.Run("a cancelled context ends it at once", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true, StallHandshake: true})
		m := newTLSMailer(t, s, func(c *mailer.Config) { c.AttemptTimeout = 10 * time.Second })
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
			t.Fatal("the handshake did not end when the context was cancelled")
		}
	})
}
