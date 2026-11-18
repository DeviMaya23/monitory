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

	"monitory/internal/domain"
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
	// roots are the trusted roots; nil means the system's roots. Tests set it.
	roots *x509.CertPool

	once   sync.Once
	client *http.Client
}

// NewHTTPProber returns a prober that follows up to maxRedirects redirects.
func NewHTTPProber(maxRedirects int) *HTTPProber {
	return &HTTPProber{maxRedirects: maxRedirects}
}

// CheckHTTP makes one request and judges the final response. The only error it returns
// is the caller's context error, when that context ended before a response was in
// hand; every other failure is a result.
func (p *HTTPProber) CheckHTTP(ctx context.Context, check domain.HTTPCheck) (domain.CheckResult, error) {
	if err := ctx.Err(); err != nil {
		return domain.CheckResult{}, err
	}
	if check.Timeout <= 0 {
		return failure(domain.FailureTimedOut), nil
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
		return p.classify(ctx, probeCtx, err)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	applyHeaders(req.Header, check.Headers)

	resp, err := p.httpClient().Do(req)
	if err != nil {
		return p.classify(ctx, probeCtx, err)
	}
	// A close error does not change a status already in hand.
	_ = resp.Body.Close()
	if resp.StatusCode >= 200 && resp.StatusCode <= 299 {
		return domain.CheckResult{Healthy: true}, nil
	}
	status := resp.StatusCode
	return domain.CheckResult{Failure: &domain.CheckFailure{
		Code:       domain.FailureNon2xxStatus,
		HTTPStatus: &status,
	}}, nil
}

// httpClient returns the prober's client, built on first use: no proxy, no keep-alive,
// no cookie jar, and a redirect policy that enforces the limit.
func (p *HTTPProber) httpClient() *http.Client {
	p.once.Do(func() {
		p.client = &http.Client{
			Transport: &http.Transport{
				Proxy:             nil,
				DisableKeepAlives: true,
				TLSClientConfig: &tls.Config{
					MinVersion: tls.VersionTLS12,
					RootCAs:    p.roots,
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
	})
	return p.client
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
