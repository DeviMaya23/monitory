package probe

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"net/http"

	"monitory/internal/domain"
)

// userAgent is the one header the probe sets itself.
const userAgent = "Monitory"

// errTooManyRedirects is returned by the client's redirect policy when a chain is
// longer than the limit.
var errTooManyRedirects = errors.New("too many redirects")

// HTTPProber makes one HTTP(S) check attempt at a time. It is safe for concurrent use.
type HTTPProber struct {
	maxRedirects int
	// roots are the trusted roots; nil means the system's roots. Tests set it.
	roots *x509.CertPool
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

	req, err := http.NewRequestWithContext(probeCtx, check.Method, check.URL, nil)
	if err != nil {
		return p.classify(ctx, probeCtx, err)
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := p.client().Do(req)
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

// client builds a client for one attempt: no proxy, no keep-alive, no cookie jar, and a
// redirect policy that enforces the limit.
func (p *HTTPProber) client() *http.Client {
	return &http.Client{
		Transport: &http.Transport{
			Proxy:             nil,
			DisableKeepAlives: true,
			TLSClientConfig: &tls.Config{
				MinVersion: tls.VersionTLS12,
				RootCAs:    p.roots,
			},
		},
		CheckRedirect: func(_ *http.Request, via []*http.Request) error {
			if len(via) > p.maxRedirects {
				return errTooManyRedirects
			}
			return nil
		},
	}
}

// classify turns a failure to get a response into a result, in the order the task
// fixes: caller's context, probe deadline, certificate, redirects, anything else.
func (p *HTTPProber) classify(callerCtx, probeCtx context.Context, cause error) (domain.CheckResult, error) {
	if err := callerCtx.Err(); err != nil {
		return domain.CheckResult{}, err
	}
	switch {
	case probeCtx.Err() != nil:
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
