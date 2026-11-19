package mailer

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"strings"
	"sync"
	"time"

	mail "github.com/wneessen/go-mail"

	"monitory/internal/domain"
)

// defaultAttemptTimeout is the deadline of one send when Config sets none.
const defaultAttemptTimeout = 10 * time.Second

// The TLS modes of Config.TLS.
const (
	tlsStartTLS = "starttls"
	tlsImplicit = "tls"
	tlsNone     = "none"
)

// reason is an error whose text is a fixed reason. The text never holds the cause's,
// because go-mail's messages can hold the address. The cause stays reachable through
// Unwrap.
type reason struct {
	text  string
	cause error
}

func (e *reason) Error() string { return e.text }
func (e *reason) Unwrap() error { return e.cause }

// ErrNotConfigured is returned when no SMTP host is configured (FR-85). Its text is the
// reason shown to the admin.
var ErrNotConfigured = &reason{text: "no SMTP account configured"}

// ErrNotAccepted is returned when the message could not be sent or the server did not
// accept it (FR-85). Its text is the reason shown to the admin.
var ErrNotAccepted = &reason{text: "the SMTP server did not accept the message"}

// sentinel makes errors.Is(err, ErrNotConfigured) and errors.Is(err, ErrNotAccepted)
// hold for a reason that carries a cause.
type sentinel struct {
	*reason
	kind *reason
}

func (e *sentinel) Is(target error) bool { return target == e.kind }

func notAccepted(cause error) error {
	return &sentinel{reason: &reason{text: ErrNotAccepted.text, cause: cause}, kind: ErrNotAccepted}
}

// Config is the SMTP account the mailer sends through.
type Config struct {
	Host string // empty means no account is configured
	Port int
	// TLS is "starttls" (mandatory STARTTLS), "tls" (implicit TLS) or "none".
	TLS      string
	Username string // empty means no authentication
	Password string
	From     string
	// AttemptTimeout is the deadline of one send; zero means 10 seconds.
	AttemptTimeout time.Duration
	// RootCAs are the roots that verify the server's certificate; nil means the
	// system's. It never turns verification off.
	RootCAs *x509.CertPool
}

// Mailer sends alert emails. It keeps no connection: each send makes its own.
type Mailer struct {
	cfg Config
}

// New returns a Mailer. It returns an error for a TLS mode it does not know.
func New(cfg Config) (*Mailer, error) {
	switch cfg.TLS {
	case tlsStartTLS, tlsImplicit, tlsNone:
	default:
		return nil, fmt.Errorf("mailer: unknown TLS mode %q", cfg.TLS)
	}
	if cfg.AttemptTimeout <= 0 {
		cfg.AttemptTimeout = defaultAttemptTimeout
	}
	return &Mailer{cfg: cfg}, nil
}

// SendEmail sends alert to the address to, once (FR-85). It returns ErrNotConfigured
// when no host is configured, the context's error when ctx ended during the send, and
// ErrNotAccepted for any other failure.
func (m *Mailer) SendEmail(ctx context.Context, to string, alert domain.Alert) error {
	if m.cfg.Host == "" {
		return ErrNotConfigured
	}

	msg := mail.NewMsg()
	if err := msg.From(m.cfg.From); err != nil {
		return notAccepted(err)
	}
	if err := msg.To(to); err != nil {
		return notAccepted(err)
	}
	msg.Subject(subject(alert))
	msg.SetBodyString(mail.TypeTextPlain, body(alert))
	msg.SetCharset(mail.CharsetUTF8)

	sendCtx, cancel := context.WithTimeout(ctx, m.cfg.AttemptTimeout)
	defer cancel()

	// go-mail ends a read it is blocked in only at a deadline, so the connection is
	// closed when the context ends, which wakes the read at once.
	var held heldConn
	dial := held.dial
	if m.cfg.TLS == tlsImplicit {
		dial = held.dialTLS(&tls.Config{
			ServerName: m.cfg.Host,
			MinVersion: tls.VersionTLS12,
			RootCAs:    m.cfg.RootCAs,
		})
	}
	client, err := m.client(dial)
	if err != nil {
		return notAccepted(err)
	}
	stop := context.AfterFunc(sendCtx, held.close)
	defer stop()

	if err := client.DialAndSendWithContext(sendCtx, msg); err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		return notAccepted(err)
	}
	return nil
}

// heldConn remembers the connection a send dials, so that the end of the send's
// context can close it.
type heldConn struct {
	mu     sync.Mutex
	conn   net.Conn
	closed bool
}

func (h *heldConn) dial(ctx context.Context, network, address string) (net.Conn, error) {
	c, err := (&net.Dialer{}).DialContext(ctx, network, address)
	if err != nil {
		return nil, err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		_ = c.Close()
		return nil, net.ErrClosed
	}
	h.conn = c
	return c, nil
}

// dialTLS returns a dial function for implicit TLS: it dials as dial does, then runs the
// TLS client handshake under ctx before it returns the connection. The connection held
// is the raw one, so closing it ends a handshake in progress as well as a read. It
// returns the *tls.Conn itself so that go-mail recognizes the connection as encrypted.
func (h *heldConn) dialTLS(cfg *tls.Config) mail.DialContextFunc {
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		raw, err := h.dial(ctx, network, address)
		if err != nil {
			return nil, err
		}
		conn := tls.Client(raw, cfg)
		if err := conn.HandshakeContext(ctx); err != nil {
			_ = raw.Close()
			return nil, err
		}
		return conn, nil
	}
}

func (h *heldConn) close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.closed = true
	if h.conn != nil {
		_ = h.conn.Close()
	}
}

func (m *Mailer) client(dial mail.DialContextFunc) (*mail.Client, error) {
	opts := []mail.Option{
		mail.WithPort(m.cfg.Port),
		mail.WithTimeout(m.cfg.AttemptTimeout),
		mail.WithDialContextFunc(dial),
	}
	switch m.cfg.TLS {
	case tlsStartTLS:
		opts = append(opts, mail.WithTLSPolicy(mail.TLSMandatory))
	case tlsImplicit:
		// Not WithSSL: with a custom dial function it only turns go-mail's own TLS
		// handling off. The dial function returns a TLS connection, and the
		// opportunistic policy lets go-mail read its state and treat it as encrypted.
		opts = append(opts, mail.WithTLSPolicy(mail.TLSOpportunistic))
	default:
		opts = append(opts, mail.WithTLSPolicy(mail.NoTLS))
	}
	if m.cfg.Username != "" {
		opts = append(opts,
			mail.WithSMTPAuth(mail.SMTPAuthAutoDiscover),
			mail.WithUsername(m.cfg.Username),
			mail.WithPassword(m.cfg.Password))
	}
	return mail.NewClient(m.cfg.Host, opts...)
}

// oneLine replaces each carriage return and line feed by a space, so a name cannot
// break a header or the layout.
func oneLine(s string) string {
	return strings.Map(func(r rune) rune {
		if r == '\r' || r == '\n' {
			return ' '
		}
		return r
	}, s)
}

func subject(a domain.Alert) string {
	name := oneLine(a.ServiceName)
	switch a.Status {
	case domain.AlertHealthy:
		return name + " is healthy again"
	case domain.AlertTest:
		return "Test alert for " + name
	}
	return name + " is unhealthy"
}

// body is the four lines of the mail: the service, the status, the time in UTC with the
// seconds dropped (FR-93) and the message (FR-23).
func body(a domain.Alert) string {
	status := "Unhealthy"
	switch a.Status {
	case domain.AlertHealthy:
		status = "Healthy"
	case domain.AlertTest:
		status = "Test"
	}
	return "Service: " + oneLine(a.ServiceName) + "\n" +
		"Status: " + status + "\n" +
		"Time: " + a.ChangedAt.UTC().Format("2006-01-02 15:04") + " UTC\n" +
		a.Message + "\n"
}
