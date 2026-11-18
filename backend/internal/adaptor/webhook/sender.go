package webhook

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"monitory/internal/domain"
)

// userAgent is the same value the check prober sends.
const userAgent = "Monitory"

// reason is an error whose text is a fixed reason. The text never holds the cause's,
// because a Go network error holds the URL and the address. The cause stays reachable
// through Unwrap.
type reason struct {
	text  string
	cause error
}

func (e *reason) Error() string { return e.text }
func (e *reason) Unwrap() error { return e.cause }

// The reasons a delivery fails (FR-85). Each text is the reason shown to the admin.
var (
	// ErrInvalidHeader is returned, before anything is sent, when a custom header has a
	// name or a value that is not valid on the wire (FR-92).
	ErrInvalidHeader = &reason{text: "a custom header is not valid"}
	// ErrCouldNotConnect is returned when no response could be had for any reason other
	// than a certificate, the deadline or the caller's context.
	ErrCouldNotConnect = &reason{text: "could not connect to the webhook"}
	// ErrCertificate is returned when the receiver's certificate is rejected.
	ErrCertificate = &reason{text: "the webhook's certificate was rejected"}
	// ErrTimedOut is returned when no response came within the configured time (FR-91).
	// Its cause is the deadline error.
	ErrTimedOut = &reason{text: "the webhook did not answer in time"}
)

// sentinel makes errors.Is(err, kind) hold for a reason that carries a cause.
type sentinel struct {
	*reason
	kind *reason
}

func (e *sentinel) Is(target error) bool { return target == e.kind }

func withCause(kind *reason, cause error) error {
	return &sentinel{reason: &reason{text: kind.text, cause: cause}, kind: kind}
}

// StatusError is returned when the receiver answers with a status that is not 2xx, a
// redirect included (FR-115). Its text holds the code only.
type StatusError struct {
	Code int
}

func (e *StatusError) Error() string {
	return "the webhook answered with status " + strconv.Itoa(e.Code)
}

// Config is what the sender is built with. It does not import platform/config.
type Config struct {
	// Timeout is how long one attempt waits for the response (FR-91). It must be positive.
	Timeout time.Duration
}

// Sender delivers alerts to webhook URLs. It is safe for concurrent use.
type Sender struct {
	timeout time.Duration
	client  *http.Client
}

// New returns a Sender. It returns an error when Timeout is zero or less.
func New(cfg Config) (*Sender, error) {
	if cfg.Timeout <= 0 {
		return nil, fmt.Errorf("webhook: timeout must be positive, got %s", cfg.Timeout)
	}
	transport := &http.Transport{
		Proxy:             nil,
		DisableKeepAlives: true,
		TLSClientConfig:   &tls.Config{MinVersion: tls.VersionTLS12},
		// A non-nil empty map keeps HTTP/2 from being negotiated.
		TLSNextProto: map[string]func(string, *tls.Conn) http.RoundTripper{},
	}
	client := &http.Client{
		Transport: transport,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	return &Sender{timeout: cfg.Timeout, client: client}, nil
}

// payload is the body of a delivery: the four values of the alert and nothing else
// (FR-23). The contract's WebhookAlertPayload.
type payload struct {
	ServiceName string `json:"service_name"`
	Status      string `json:"status"`
	ChangedAt   string `json:"changed_at"`
	Message     string `json:"message"`
}

// SendWebhook makes one attempt to deliver alert to url as a POST with a JSON body and
// the custom headers (FR-90, FR-92). It returns nil for a 2xx answer, the context's
// error when ctx ended first, and otherwise one of the reasons above or a *StatusError.
// The text of every error is the reason only.
func (s *Sender) SendWebhook(ctx context.Context, url string, headers []domain.NameValue, alert domain.Alert) error {
	for _, h := range headers {
		if !validHeaderName(h.Name) || !validHeaderValue(h.Value) {
			return ErrInvalidHeader
		}
	}

	body, err := json.Marshal(payload{
		ServiceName: alert.ServiceName,
		Status:      string(alert.Status),
		ChangedAt:   alert.ChangedAt.UTC().Format("2006-01-02T15:04:05Z"),
		Message:     alert.Message,
	})
	if err != nil {
		return withCause(ErrCouldNotConnect, err)
	}

	attemptCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(attemptCtx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return withCause(ErrCouldNotConnect, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", userAgent)
	replaced := map[string]bool{}
	for _, h := range headers {
		name := http.CanonicalHeaderKey(h.Name)
		if (name == "Content-Type" || name == "User-Agent") && !replaced[name] {
			replaced[name] = true
			req.Header.Set(name, h.Value)
			continue
		}
		req.Header.Add(name, h.Value)
	}

	resp, err := s.client.Do(req)
	if err != nil {
		switch {
		case ctx.Err() != nil:
			return ctx.Err()
		case attemptCtx.Err() != nil:
			return withCause(ErrTimedOut, attemptCtx.Err())
		case isCertificateError(err):
			return withCause(ErrCertificate, err)
		default:
			return withCause(ErrCouldNotConnect, err)
		}
	}
	// The body is not read: only the status matters.
	_ = resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode <= 299 {
		return nil
	}
	return &StatusError{Code: resp.StatusCode}
}

// validHeaderName reports whether name is a non-empty run of HTTP token characters.
func validHeaderName(name string) bool {
	if name == "" {
		return false
	}
	for i := 0; i < len(name); i++ {
		c := name[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
		case bytes.IndexByte([]byte("!#$%&'*+-.^_`|~"), c) >= 0:
		default:
			return false
		}
	}
	return true
}

// validHeaderValue reports whether value holds no control byte other than a tab, and
// no DEL.
func validHeaderValue(value string) bool {
	for i := 0; i < len(value); i++ {
		c := value[i]
		if (c < 0x20 && c != '\t') || c == 0x7f {
			return false
		}
	}
	return true
}

// isCertificateError is a copy of the check in adaptor/probe: adaptors do not import
// each other.
func isCertificateError(err error) bool {
	var verify *tls.CertificateVerificationError
	var unknown x509.UnknownAuthorityError
	var invalid x509.CertificateInvalidError
	var host x509.HostnameError
	return errors.As(err, &verify) || errors.As(err, &unknown) ||
		errors.As(err, &invalid) || errors.As(err, &host)
}
