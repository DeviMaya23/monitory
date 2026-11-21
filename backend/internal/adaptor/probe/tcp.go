package probe

import (
	"context"
	"errors"
	"net"
	"strconv"

	"monitory/internal/domain"
)

// TCPProber makes one TCP check attempt at a time. It keeps no state between attempts
// and is safe for concurrent use.
type TCPProber struct {
	// dial opens the connection. Tests replace it.
	dial func(ctx context.Context, network, address string) (net.Conn, error)
}

// NewTCPProber returns a TCPProber that uses the standard dialer.
func NewTCPProber() *TCPProber {
	var d net.Dialer
	return &TCPProber{dial: d.DialContext}
}

// CheckTCP connects to the check's host and port and closes the connection at once.
// The timeout covers the name lookup and the connect together (FR-41). The only error
// it returns is the caller's context error; every other failure is a result.
func (p *TCPProber) CheckTCP(ctx context.Context, check domain.TCPCheck) (domain.CheckResult, error) {
	if err := ctx.Err(); err != nil {
		return domain.CheckResult{}, err
	}
	if check.Timeout <= 0 {
		return failure(domain.FailureTimedOut), nil
	}
	if check.Host == "" {
		// The standard dialer reads ":port" as the local machine: never a healthy check.
		return failure(domain.FailureCouldNotConnect), nil
	}
	probeCtx, cancel := context.WithTimeout(ctx, check.Timeout)
	defer cancel()

	address := net.JoinHostPort(check.Host, strconv.Itoa(check.Port))
	conn, err := p.dial(probeCtx, "tcp", address)
	if err == nil {
		// A close error does not change an accepted connection (FR-49).
		_ = conn.Close()
		return domain.CheckResult{Healthy: true}, nil
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		return domain.CheckResult{}, ctxErr
	}
	if errors.Is(probeCtx.Err(), context.DeadlineExceeded) {
		return failure(domain.FailureTimedOut), nil
	}
	return failure(domain.FailureCouldNotConnect), nil
}
