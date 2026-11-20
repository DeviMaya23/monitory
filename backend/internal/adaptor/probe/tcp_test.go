package probe

import (
	"context"
	"errors"
	"io"
	"net"
	"strconv"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
)

func listen(t *testing.T) net.Listener {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = l.Close() })
	return l
}

func hostPort(t *testing.T, addr net.Addr) (string, int) {
	t.Helper()
	h, p, err := net.SplitHostPort(addr.String())
	require.NoError(t, err)
	port, err := strconv.Atoi(p)
	require.NoError(t, err)
	return h, port
}

func requireFailure(t *testing.T, res domain.CheckResult, code domain.FailureCode) {
	t.Helper()
	assert.False(t, res.Healthy)
	require.NotNil(t, res.Failure)
	assert.Equal(t, code, res.Failure.Code)
	assert.Nil(t, res.Failure.HTTPStatus)
	assert.Nil(t, res.Failure.JSONRuleField)
}

// dialStub returns a prober whose dial function is fn, and a counter of its calls.
func dialStub(fn func(ctx context.Context, address string) (net.Conn, error)) (*TCPProber, *int) {
	var mu sync.Mutex
	calls := new(int)
	p := NewTCPProber()
	p.dial = func(ctx context.Context, _, address string) (net.Conn, error) {
		mu.Lock()
		*calls++
		mu.Unlock()
		return fn(ctx, address)
	}
	return p, calls
}

func blockUntilDone(ctx context.Context, _ string) (net.Conn, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func TestCheckTCP_Accepted(t *testing.T) {
	l := listen(t)
	host, port := hostPort(t, l.Addr())
	type seen struct {
		data []byte
		err  error
	}
	got := make(chan seen, 2)
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				return
			}
			_ = c.SetReadDeadline(time.Now().Add(2 * time.Second))
			buf := make([]byte, 16)
			n, err := c.Read(buf)
			got <- seen{buf[:n], err}
			_ = c.Close()
		}
	}()

	res, err := NewTCPProber().CheckTCP(t.Context(), domain.TCPCheck{Host: host, Port: port, Timeout: 2 * time.Second})

	require.NoError(t, err)
	assert.Equal(t, domain.CheckResult{Healthy: true}, res)
	select {
	case s := <-got:
		assert.Empty(t, s.data)
		assert.ErrorIs(t, s.err, io.EOF)
	case <-time.After(3 * time.Second):
		require.FailNow(t, "the listener saw no connection")
	}
	select {
	case <-got:
		require.FailNow(t, "the listener saw a second connection")
	default:
	}
}

func TestCheckTCP_ClosedPort(t *testing.T) {
	l := listen(t)
	host, port := hostPort(t, l.Addr())
	require.NoError(t, l.Close())

	res, err := NewTCPProber().CheckTCP(t.Context(), domain.TCPCheck{Host: host, Port: port, Timeout: 2 * time.Second})

	require.NoError(t, err)
	requireFailure(t, res, domain.FailureCouldNotConnect)
}

func TestCheckTCP_DialErrors(t *testing.T) {
	tests := map[string]error{
		"name not found":     &net.DNSError{Err: "no such host", Name: "nope.test", IsNotFound: true},
		"connection refused": &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED},
		"plain error":        errors.New("boom"),
	}
	for name, dialErr := range tests {
		t.Run(name, func(t *testing.T) {
			p, calls := dialStub(func(context.Context, string) (net.Conn, error) { return nil, dialErr })

			res, err := p.CheckTCP(t.Context(), domain.TCPCheck{Host: "h.test", Port: 81, Timeout: 2 * time.Second})

			require.NoError(t, err)
			requireFailure(t, res, domain.FailureCouldNotConnect)
			assert.Equal(t, 1, *calls)
		})
	}
	t.Run("host with a space, real dialer", func(t *testing.T) {
		res, err := NewTCPProber().CheckTCP(t.Context(), domain.TCPCheck{Host: "bad host", Port: 81, Timeout: 2 * time.Second})

		require.NoError(t, err)
		requireFailure(t, res, domain.FailureCouldNotConnect)
	})
}

func TestCheckTCP_Timeout(t *testing.T) {
	var deadline time.Time
	var hasDeadline bool
	p, _ := dialStub(func(ctx context.Context, address string) (net.Conn, error) {
		deadline, hasDeadline = ctx.Deadline()
		if !hasDeadline {
			// Fail at once: blocking here would hang the test until go test's own limit.
			return nil, errors.New("the dial context has no deadline")
		}
		return blockUntilDone(ctx, address)
	})

	begin := time.Now()
	res, err := p.CheckTCP(t.Context(), domain.TCPCheck{Host: "h.test", Port: 81, Timeout: 50 * time.Millisecond})

	require.NoError(t, err)
	requireFailure(t, res, domain.FailureTimedOut)
	require.True(t, hasDeadline, "the dialer's context has no deadline")
	assert.WithinDuration(t, begin.Add(50*time.Millisecond), deadline, 40*time.Millisecond)
}

func TestCheckTCP_NonPositiveTimeout(t *testing.T) {
	for name, timeout := range map[string]time.Duration{"zero": 0, "negative": -time.Second} {
		t.Run(name, func(t *testing.T) {
			p, calls := dialStub(blockUntilDone)

			res, err := p.CheckTCP(t.Context(), domain.TCPCheck{Host: "h.test", Port: 81, Timeout: timeout})

			require.NoError(t, err)
			requireFailure(t, res, domain.FailureTimedOut)
			assert.Zero(t, *calls)
		})
	}
}

func TestCheckTCP_CallerContext(t *testing.T) {
	check := domain.TCPCheck{Host: "h.test", Port: 81, Timeout: 2 * time.Second}

	t.Run("cancelled while the dial blocks", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		entered := make(chan struct{})
		p, _ := dialStub(func(ctx context.Context, a string) (net.Conn, error) {
			close(entered)
			return blockUntilDone(ctx, a)
		})
		type out struct {
			res domain.CheckResult
			err error
		}
		done := make(chan out, 1)
		go func() {
			res, err := p.CheckTCP(ctx, check)
			done <- out{res, err}
		}()
		<-entered
		cancel()
		o := <-done
		require.ErrorIs(t, o.err, context.Canceled)
		assert.Equal(t, domain.CheckResult{}, o.res)
	})
	t.Run("caller deadline shorter than the timeout", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Millisecond)
		defer cancel()
		p, _ := dialStub(blockUntilDone)

		res, err := p.CheckTCP(ctx, check)

		require.ErrorIs(t, err, context.DeadlineExceeded)
		assert.Equal(t, domain.CheckResult{}, res)
	})
	t.Run("already cancelled", func(t *testing.T) {
		ctx, cancel := context.WithCancel(t.Context())
		cancel()
		p, calls := dialStub(blockUntilDone)

		res, err := p.CheckTCP(ctx, check)

		require.ErrorIs(t, err, context.Canceled)
		assert.Equal(t, domain.CheckResult{}, res)
		assert.Zero(t, *calls)
	})
}

func TestCheckTCP_IPv6Address(t *testing.T) {
	var got string
	p, _ := dialStub(func(_ context.Context, address string) (net.Conn, error) {
		got = address
		return nil, errors.New("stop")
	})

	_, err := p.CheckTCP(t.Context(), domain.TCPCheck{Host: "::1", Port: 8443, Timeout: time.Second})

	require.NoError(t, err)
	assert.Equal(t, "[::1]:8443", got)
}

func TestCheckTCP_PortLimits(t *testing.T) {
	for _, port := range []int{1, 65535} {
		t.Run(strconv.Itoa(port), func(t *testing.T) {
			var got string
			p, _ := dialStub(func(_ context.Context, address string) (net.Conn, error) {
				got = address
				return nil, errors.New("stop")
			})

			_, err := p.CheckTCP(t.Context(), domain.TCPCheck{Host: "127.0.0.1", Port: port, Timeout: time.Second})

			require.NoError(t, err)
			assert.Equal(t, "127.0.0.1:"+strconv.Itoa(port), got)
		})
	}
}

// A listener closed and then opened again on the same port: the second attempt is
// healthy, so the prober keeps nothing from the failed one.
func TestCheckTCP_ListenerReopened(t *testing.T) {
	first := listen(t)
	host, port := hostPort(t, first.Addr())
	require.NoError(t, first.Close())
	p := NewTCPProber()
	check := domain.TCPCheck{Host: host, Port: port, Timeout: 2 * time.Second}

	res, err := p.CheckTCP(t.Context(), check)
	require.NoError(t, err)
	requireFailure(t, res, domain.FailureCouldNotConnect)

	reopened, err := net.Listen("tcp", net.JoinHostPort(host, strconv.Itoa(port)))
	if err != nil {
		t.Skipf("the port was taken by another process: %v", err)
	}
	t.Cleanup(func() { _ = reopened.Close() })
	go func() {
		for {
			c, err := reopened.Accept()
			if err != nil {
				return
			}
			_ = c.Close()
		}
	}()

	res, err = p.CheckTCP(t.Context(), check)
	require.NoError(t, err)
	assert.Equal(t, domain.CheckResult{Healthy: true}, res)
}

func TestCheckTCP_Concurrent(t *testing.T) {
	open := listen(t)
	go func() {
		for {
			c, err := open.Accept()
			if err != nil {
				return
			}
			_ = c.Close()
		}
	}()
	openHost, openPort := hostPort(t, open.Addr())
	closed := listen(t)
	closedHost, closedPort := hostPort(t, closed.Addr())
	require.NoError(t, closed.Close())

	prober := NewTCPProber()
	var wg sync.WaitGroup
	for i := range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if i%2 == 0 {
				res, err := prober.CheckTCP(t.Context(), domain.TCPCheck{Host: openHost, Port: openPort, Timeout: 2 * time.Second})
				assert.NoError(t, err)
				assert.True(t, res.Healthy)
				return
			}
			res, err := prober.CheckTCP(t.Context(), domain.TCPCheck{Host: closedHost, Port: closedPort, Timeout: 2 * time.Second})
			assert.NoError(t, err)
			if assert.NotNil(t, res.Failure) {
				assert.Equal(t, domain.FailureCouldNotConnect, res.Failure.Code)
			}
		}()
	}
	wg.Wait()
}
