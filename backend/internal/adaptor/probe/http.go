package probe

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"monitory/internal/domain"
	"monitory/pkg/clock"
)

// userAgent is the one header the probe sets itself.
const userAgent = "Monitory"

// savedHeadersKey carries a check's saved headers in the request context.
type savedHeadersKey struct{}

// bodyContentType is the content type of a body type, or "" when no body is sent.
func bodyContentType(t domain.BodyType) string {
	switch t {
	case domain.BodyTypeJSON:
		return "application/json"
	case domain.BodyTypeText:
		return "text/plain"
	case domain.BodyTypeForm:
		return "application/x-www-form-urlencoded"
	default:
		return ""
	}
}

// withQueryParams appends params to the URL's own query, in order. The fragment is
// dropped, as the library never sends it. With no params the URL is returned as given.
func withQueryParams(rawURL string, params []domain.NameValue) string {
	if len(params) == 0 {
		return rawURL
	}
	rawURL, _, _ = strings.Cut(rawURL, "#")
	base, query, _ := strings.Cut(rawURL, "?")
	parts := make([]string, 0, len(params))
	for _, kv := range params {
		parts = append(parts, url.QueryEscape(kv.Name)+"="+url.QueryEscape(kv.Value))
	}
	added := strings.Join(parts, "&")
	switch {
	case query == "":
		query = added
	case strings.HasSuffix(query, "&"):
		query += added
	default:
		query += "&" + added
	}
	return base + "?" + query
}

// applyHeaders sets the default User-Agent unless a saved header has that name, then
// the saved headers. Whatever the request already holds under a saved name (a default,
// or a copy the library made on a redirect) is replaced by the saved values, in order.
func applyHeaders(h http.Header, saved []domain.NameValue) {
	savedUA := false
	for _, kv := range saved {
		h.Del(kv.Name)
		savedUA = savedUA || http.CanonicalHeaderKey(kv.Name) == "User-Agent"
	}
	if !savedUA {
		h.Set("User-Agent", userAgent)
	}
	for _, kv := range saved {
		h.Add(kv.Name, kv.Value)
	}
}

// errTooManyRedirects is returned by the client's redirect policy when a chain is
// longer than the limit.
var errTooManyRedirects = errors.New("too many redirects")

// HTTPProber makes one HTTP(S) check attempt at a time. It is safe for concurrent use.
type HTTPProber struct {
	maxRedirects int
	// maxBodyBytes caps how much of a response body is read: when a check has JSON
	// rules (FR-73) and for a test (FR-104).
	maxBodyBytes int
	// roots are the trusted roots; nil means the system's roots. Tests set it.
	roots *x509.CertPool
	clock clock.Clock

	// once builds both clients: client verifies certificates, lenientClient (used only
	// for a check that ignores certificate errors) does not.
	once          sync.Once
	client        *http.Client
	lenientClient *http.Client
}

// NewHTTPProber returns a prober that follows up to maxRedirects redirects and reads
// at most maxBodyBytes of a body for a check with JSON rules. clk is "now" for the
// certificate expiry check and for chain verification.
func NewHTTPProber(maxRedirects, maxBodyBytes int, clk clock.Clock) *HTTPProber {
	return &HTTPProber{maxRedirects: maxRedirects, maxBodyBytes: maxBodyBytes, clock: clk}
}

// CheckHTTP makes one request and judges the final response. The only error it returns
// is the caller's context error, when that context ended before a response was in
// hand; every other failure is a result. It reads a body only when the check has JSON
// rules (FR-73).
func (p *HTTPProber) CheckHTTP(ctx context.Context, check domain.HTTPCheck) (domain.CheckResult, error) {
	out, err := p.attempt(ctx, check, false)
	return out.CheckResult, err
}

// TestHTTP makes the same single request as CheckHTTP and gives the same verdict, and
// also returns the final response's status and its body, read up to the configured
// limit whether or not the check has JSON rules (FR-104). The only error it returns is
// the caller's context error, with an empty outcome.
func (p *HTTPProber) TestHTTP(ctx context.Context, check domain.HTTPCheck) (domain.HTTPTestOutcome, error) {
	return p.attempt(ctx, check, true)
}

// attempt is the one implementation of the request, the judgment and the
// classification behind CheckHTTP and TestHTTP. With forTest the body is always read
// and returned, with the status; without it the outcome holds the verdict only.
func (p *HTTPProber) attempt(ctx context.Context, check domain.HTTPCheck, forTest bool) (domain.HTTPTestOutcome, error) {
	if err := ctx.Err(); err != nil {
		return domain.HTTPTestOutcome{}, err
	}
	if check.Timeout <= 0 {
		return domain.HTTPTestOutcome{CheckResult: failure(domain.FailureTimedOut)}, nil
	}
	probeCtx, cancel := context.WithTimeout(ctx, check.Timeout)
	defer cancel()

	var body io.Reader
	contentType := bodyContentType(check.BodyType)
	if contentType != "" {
		body = strings.NewReader(check.BodyContent)
	}
	// The saved headers travel in the context so the redirect policy of the shared
	// client can set them again on each hop without sharing state between checks.
	reqCtx := context.WithValue(probeCtx, savedHeadersKey{}, check.Headers)
	req, err := http.NewRequestWithContext(reqCtx, check.Method, withQueryParams(check.URL, check.QueryParams), body)
	if err != nil {
		return p.classifyOutcome(ctx, probeCtx, err)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	applyHeaders(req.Header, check.Headers)

	resp, err := p.httpClient(check.IgnoreCertificateErrors).Do(req)
	if err != nil {
		return p.classifyOutcome(ctx, probeCtx, err)
	}
	defer func() {
		// A close error does not change a result already in hand.
		_ = resp.Body.Close()
	}()
	status := resp.StatusCode
	out := domain.HTTPTestOutcome{}
	if forTest {
		out.HTTPStatus = &status
	}

	// A certificate too close to expiry is the connection's problem and comes before
	// the body and the status.
	certProblem := check.CertificateCheck && p.certificateTooClose(resp, check.CertMinDaysLeft)
	hasRules := len(check.JSONRules) > 0

	// The body is read under the same deadline as the request, at most one byte past
	// the limit: seeing that byte is enough to know the body is too large.
	var data []byte
	var readErr error
	if forTest || (hasRules && !certProblem) {
		data, readErr = io.ReadAll(io.LimitReader(resp.Body, int64(p.maxBodyBytes)+1))
		if readErr != nil {
			if err := ctx.Err(); err != nil {
				return domain.HTTPTestOutcome{}, err
			}
		}
	}
	tooLarge := len(data) > p.maxBodyBytes
	if forTest {
		out.Body = string(data[:min(len(data), p.maxBodyBytes)])
		out.BodyTruncated = tooLarge
	}
	out.CheckResult = p.judge(check, probeCtx, status, certProblem, data, tooLarge, readErr)
	return out, nil
}

// judge gives the verdict on a response in hand: certificate expiry first; with no
// JSON rules the status; with rules the body, where a rule match wins over a non-2xx
// status and a non-2xx status wins over an unjudgeable body. data and readErr are the
// body as read, when it was read.
func (p *HTTPProber) judge(check domain.HTTPCheck, probeCtx context.Context, status int, certProblem bool, data []byte, tooLarge bool, readErr error) domain.CheckResult {
	if certProblem {
		return failure(domain.FailureCertificateProblem)
	}
	ok2xx := status >= 200 && status <= 299
	statusFailure := domain.CheckResult{Failure: &domain.CheckFailure{
		Code:       domain.FailureNon2xxStatus,
		HTTPStatus: &status,
	}}

	if len(check.JSONRules) == 0 {
		if ok2xx {
			return domain.CheckResult{Healthy: true}
		}
		return statusFailure
	}
	if readErr != nil {
		switch {
		case errors.Is(probeCtx.Err(), context.DeadlineExceeded):
			return failure(domain.FailureTimedOut)
		case !ok2xx:
			return statusFailure
		default:
			return failure(domain.FailureCouldNotConnect)
		}
	}
	verdict := evaluateJSONRules(data, tooLarge, check.JSONRules, check.JSONRuleMode)
	switch {
	case verdict.Failed:
		field := verdict.Field
		return domain.CheckResult{Failure: &domain.CheckFailure{
			Code:          domain.FailureJSONRuleMatched,
			JSONRuleField: &field,
		}}
	case !ok2xx:
		return statusFailure
	case verdict.Unjudgeable:
		return failure(domain.FailureInvalidOrMissingJSON)
	default:
		return domain.CheckResult{Healthy: true}
	}
}

// classifyOutcome is classify for a failure to get a response: no status, no body.
func (p *HTTPProber) classifyOutcome(callerCtx, probeCtx context.Context, cause error) (domain.HTTPTestOutcome, error) {
	res, err := p.classify(callerCtx, probeCtx, cause)
	return domain.HTTPTestOutcome{CheckResult: res}, err
}

// httpClient returns the verifying client, or, when ignoreCertErrs is set, the one
// that accepts any certificate. Both are built on first use.
func (p *HTTPProber) httpClient(ignoreCertErrs bool) *http.Client {
	p.once.Do(func() {
		p.client = p.newClient(false)
		p.lenientClient = p.newClient(true)
	})
	if ignoreCertErrs {
		return p.lenientClient
	}
	return p.client
}

// newClient builds a client with no proxy, no keep-alive, no cookie jar and a redirect
// policy that enforces the limit. The two clients differ only in skipVerify.
func (p *HTTPProber) newClient(skipVerify bool) *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			Proxy:             nil,
			DisableKeepAlives: true,
			TLSClientConfig: &tls.Config{
				MinVersion:         tls.VersionTLS12,
				RootCAs:            p.roots,
				Time:               p.clock.Now,
				InsecureSkipVerify: skipVerify, // FR-64: only for a service that asks for it
			},
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > p.maxRedirects {
				return errTooManyRedirects
			}
			// Saved headers go with every hop (FR-58), replacing what the
			// library copied or stripped.
			saved, _ := req.Context().Value(savedHeadersKey{}).([]domain.NameValue)
			applyHeaders(req.Header, saved)
			return nil
		},
	}
}

// certificateTooClose reports whether the leaf certificate of resp's connection has
// fewer than minDays whole days left. A response not received over TLS is never too
// close; an expired certificate has 0 days left.
func (p *HTTPProber) certificateTooClose(resp *http.Response, minDays int) bool {
	if resp.TLS == nil || len(resp.TLS.PeerCertificates) == 0 {
		return false
	}
	left := resp.TLS.PeerCertificates[0].NotAfter.Sub(p.clock.Now())
	days := max(int(left/(24*time.Hour)), 0)
	return days < minDays
}

// classify turns a failure to get a response into a result, in the order the task
// fixes: caller's context, probe deadline, certificate, redirects, anything else.
func (p *HTTPProber) classify(callerCtx, probeCtx context.Context, cause error) (domain.CheckResult, error) {
	if err := callerCtx.Err(); err != nil {
		return domain.CheckResult{}, err
	}
	deadlinePassed := errors.Is(probeCtx.Err(), context.DeadlineExceeded)
	switch {
	case deadlinePassed:
		return failure(domain.FailureTimedOut), nil
	case isCertificateError(cause):
		return failure(domain.FailureCertificateProblem), nil
	case errors.Is(cause, errTooManyRedirects):
		return failure(domain.FailureTooManyRedirects), nil
	default:
		return failure(domain.FailureCouldNotConnect), nil
	}
}

func isCertificateError(err error) bool {
	var verify *tls.CertificateVerificationError
	var unknown x509.UnknownAuthorityError
	var invalid x509.CertificateInvalidError
	var host x509.HostnameError
	return errors.As(err, &verify) || errors.As(err, &unknown) ||
		errors.As(err, &invalid) || errors.As(err, &host)
}

func failure(code domain.FailureCode) domain.CheckResult {
	return domain.CheckResult{Failure: &domain.CheckFailure{Code: code}}
}
