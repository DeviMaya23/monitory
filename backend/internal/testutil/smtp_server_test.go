package testutil_test

import (
	"bufio"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"fmt"
	"net"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/testutil"
)

// client is a minimal SMTP client for the tests.
type client struct {
	t *testing.T
	c net.Conn
	r *bufio.Reader
}

func dial(t *testing.T, s *testutil.SMTPServer) *client {
	t.Helper()
	c, err := net.DialTimeout("tcp", s.Addr(), 2*time.Second)
	require.NoError(t, err)
	t.Cleanup(func() { _ = c.Close() })
	return &client{t: t, c: c, r: bufio.NewReader(c)}
}

// read returns one reply, all its lines joined by "|".
func (c *client) read() string {
	c.t.Helper()
	require.NoError(c.t, c.c.SetReadDeadline(time.Now().Add(2*time.Second)))
	var lines []string
	for {
		line, err := c.r.ReadString('\n')
		require.NoError(c.t, err)
		line = strings.TrimRight(line, "\r\n")
		lines = append(lines, line)
		if len(line) < 4 || line[3] != '-' {
			return strings.Join(lines, "|")
		}
	}
}

func (c *client) send(format string, args ...any) string {
	c.t.Helper()
	_, err := fmt.Fprintf(c.c, format+"\r\n", args...)
	require.NoError(c.t, err)
	return c.read()
}

func (c *client) deliver(to string) string {
	c.t.Helper()
	require.True(c.t, strings.HasPrefix(c.read(), "220"))
	require.True(c.t, strings.HasPrefix(c.send("EHLO client"), "250"))
	require.True(c.t, strings.HasPrefix(c.send("MAIL FROM:<from@x> SIZE=10 BODY=8BITMIME"), "250"))
	if got := c.send("RCPT TO:<%s>", to); !strings.HasPrefix(got, "250") {
		return got
	}
	require.True(c.t, strings.HasPrefix(c.send("DATA"), "354"))
	return c.send("Subject: hi\r\n\r\n..dotted\r\nbody\r\n.")
}

func TestSMTPServer_RecordsAMessage(t *testing.T) {
	s := testutil.NewSMTPServer(t, testutil.SMTPOptions{})
	c := dial(t, s)

	assert.True(t, strings.HasPrefix(c.deliver("to@x"), "250"))

	msgs := s.Messages()
	require.Len(t, msgs, 1)
	assert.Equal(t, "from@x", msgs[0].From)
	assert.Equal(t, []string{"to@x"}, msgs[0].To)
	assert.Equal(t, "Subject: hi\r\n\r\n.dotted\r\nbody\r\n", msgs[0].Data)
	assert.Equal(t, 1, s.Connections())
	assert.True(t, strings.HasPrefix(c.send("NOOP"), "250"))
	assert.True(t, strings.HasPrefix(c.send("RSET"), "250"))
	assert.True(t, strings.HasPrefix(c.send("QUIT"), "221"))
}

func TestSMTPServer_AdvertisesNothingExtra(t *testing.T) {
	s := testutil.NewSMTPServer(t, testutil.SMTPOptions{})
	c := dial(t, s)
	c.read()
	assert.Equal(t, "250 test.local", c.send("EHLO x"))
}

func TestSMTPServer_RejectsTheRecipient(t *testing.T) {
	s := testutil.NewSMTPServer(t, testutil.SMTPOptions{RejectRecipient: true})
	c := dial(t, s)

	assert.True(t, strings.HasPrefix(c.deliver("to@x"), "550"))
	assert.Empty(t, s.Messages())
}

func TestSMTPServer_RejectsTheSender(t *testing.T) {
	s := testutil.NewSMTPServer(t, testutil.SMTPOptions{RejectSender: true})
	c := dial(t, s)
	c.read()
	require.True(t, strings.HasPrefix(c.send("EHLO client"), "250"))

	assert.True(t, strings.HasPrefix(c.send("MAIL FROM:<from@x>"), "550"))
	assert.Empty(t, s.Messages())
}

func TestSMTPServer_RejectsData(t *testing.T) {
	s := testutil.NewSMTPServer(t, testutil.SMTPOptions{RejectData: true})
	c := dial(t, s)
	c.read()
	require.True(t, strings.HasPrefix(c.send("EHLO client"), "250"))
	require.True(t, strings.HasPrefix(c.send("MAIL FROM:<from@x>"), "250"))
	require.True(t, strings.HasPrefix(c.send("RCPT TO:<to@x>"), "250"))

	assert.True(t, strings.HasPrefix(c.send("DATA"), "554"))
	assert.Empty(t, s.Messages())
}

func TestSMTPServer_ClosesAtConnect(t *testing.T) {
	s := testutil.NewSMTPServer(t, testutil.SMTPOptions{CloseAtConnect: true})
	c := dial(t, s)

	require.NoError(t, c.c.SetReadDeadline(time.Now().Add(2*time.Second)))
	_, err := c.r.ReadString('\n')
	assert.Error(t, err)
}

func TestSMTPServer_DelaysTheGreeting(t *testing.T) {
	s := testutil.NewSMTPServer(t, testutil.SMTPOptions{GreetingDelay: 150 * time.Millisecond})
	c := dial(t, s)
	start := time.Now()

	assert.True(t, strings.HasPrefix(c.read(), "220"))
	assert.GreaterOrEqual(t, time.Since(start), 100*time.Millisecond)
}

func TestSMTPServer_RequiresAuth(t *testing.T) {
	plain := func(user, pass string) string {
		return base64.StdEncoding.EncodeToString([]byte("\x00" + user + "\x00" + pass))
	}
	opts := testutil.SMTPOptions{Username: "u", Password: "p"}

	t.Run("a mail without AUTH is refused", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, opts)
		c := dial(t, s)
		c.read()
		assert.Contains(t, c.send("EHLO x"), "AUTH PLAIN")
		assert.True(t, strings.HasPrefix(c.send("MAIL FROM:<a@x>"), "530"))
	})
	t.Run("the right password is accepted, inline or after a prompt", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, opts)
		c := dial(t, s)
		c.read()
		c.send("EHLO x")
		assert.True(t, strings.HasPrefix(c.send("AUTH PLAIN %s", plain("u", "p")), "235"))
		assert.True(t, strings.HasPrefix(c.send("MAIL FROM:<a@x>"), "250"))

		c2 := dial(t, s)
		c2.read()
		c2.send("EHLO x")
		assert.True(t, strings.HasPrefix(c2.send("AUTH PLAIN"), "334"))
		assert.True(t, strings.HasPrefix(c2.send("%s", plain("u", "p")), "235"))
		assert.Equal(t, 2, s.AuthCommands())
	})
	t.Run("a wrong password is refused", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, opts)
		c := dial(t, s)
		c.read()
		c.send("EHLO x")
		assert.True(t, strings.HasPrefix(c.send("AUTH PLAIN %s", plain("u", "wrong")), "535"))
		assert.True(t, strings.HasPrefix(c.send("MAIL FROM:<a@x>"), "530"))
	})
	t.Run("without the option AUTH is not offered", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{})
		c := dial(t, s)
		c.read()
		assert.True(t, strings.HasPrefix(c.send("AUTH PLAIN %s", plain("u", "p")), "502"))
	})
}

func TestSMTPServer_ServesSeveralConnectionsAtOnce(t *testing.T) {
	s := testutil.NewSMTPServer(t, testutil.SMTPOptions{})
	var wg sync.WaitGroup
	for i := range 5 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c := dial(t, s)
			assert.True(t, strings.HasPrefix(c.deliver(fmt.Sprintf("to%d@x", i)), "250"))
		}()
	}
	wg.Wait()

	assert.Len(t, s.Messages(), 5)
	assert.Equal(t, 5, s.Connections())
}

func TestSMTPServer_FreesItsPortWhenTheTestEnds(t *testing.T) {
	var addr string
	t.Run("server", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{GreetingDelay: time.Minute})
		addr = s.Addr()
		_ = dial(t, s) // a connection stuck in the greeting delay does not hold the stop
	})

	l, err := net.Listen("tcp", addr)
	require.NoError(t, err, "the port is free again")
	_ = l.Close()
}

func dialTLS(t *testing.T, s *testutil.SMTPServer, pool *x509.CertPool, serverName string) (*client, error) {
	t.Helper()
	d := &net.Dialer{Timeout: 2 * time.Second}
	c, err := tls.DialWithDialer(d, "tcp", s.Addr(), &tls.Config{RootCAs: pool, ServerName: serverName, MinVersion: tls.VersionTLS12})
	if err != nil {
		return nil, err
	}
	t.Cleanup(func() { _ = c.Close() })
	return &client{t: t, c: c, r: bufio.NewReader(c)}, nil
}

func TestSMTPServer_TLS(t *testing.T) {
	t.Run("a client that trusts the pool completes the handshake and a conversation", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true})
		c, err := dialTLS(t, s, s.Pool(), "127.0.0.1")
		require.NoError(t, err)

		assert.True(t, strings.HasPrefix(c.deliver("to@x"), "250"))

		require.Len(t, s.Messages(), 1)
		assert.Equal(t, 1, s.Connections())
		assert.Equal(t, 1, s.Handshakes())
	})
	t.Run("the certificate names localhost too", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true})
		_, err := dialTLS(t, s, s.Pool(), "localhost")
		require.NoError(t, err)
	})
	t.Run("CertNames replaces the default names", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true, CertNames: []string{"smtp.example.test"}})
		_, err := dialTLS(t, s, s.Pool(), "127.0.0.1")
		require.Error(t, err)
		_, err = dialTLS(t, s, s.Pool(), "smtp.example.test")
		require.NoError(t, err)
	})
	t.Run("a client that trusts nothing is refused at the handshake", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true})

		_, err := dialTLS(t, s, nil, "127.0.0.1")

		require.Error(t, err)
		assert.Empty(t, s.Messages())
		assert.Zero(t, s.Handshakes())
	})
	t.Run("a plain-text client gets no greeting it can read", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true})
		c := dial(t, s)
		require.NoError(t, c.c.SetReadDeadline(time.Now().Add(2*time.Second)))
		_, err := fmt.Fprint(c.c, "EHLO client\r\n")
		require.NoError(t, err)

		line, _ := c.r.ReadString('\n')

		assert.False(t, strings.HasPrefix(line, "220"))
		assert.Empty(t, s.Messages())
		assert.Zero(t, s.Handshakes())
	})
	t.Run("a stalled handshake never completes and the server frees the port at the end", func(t *testing.T) {
		var addr string
		t.Run("server", func(t *testing.T) {
			s := testutil.NewSMTPServer(t, testutil.SMTPOptions{TLS: true, StallHandshake: true})
			addr = s.Addr()
			raw, err := net.DialTimeout("tcp", addr, 2*time.Second)
			require.NoError(t, err)
			t.Cleanup(func() { _ = raw.Close() })
			require.NoError(t, raw.SetDeadline(time.Now().Add(150*time.Millisecond)))
			tc := tls.Client(raw, &tls.Config{RootCAs: s.Pool(), ServerName: "127.0.0.1"})

			require.Error(t, tc.Handshake(), "the client gives up at its deadline")
			assert.Zero(t, s.Handshakes())
			assert.Equal(t, 1, s.Connections())
			assert.Empty(t, s.Messages())
		}) // the server's cleanup runs here and would hang if it did not end the connection

		_, err := net.DialTimeout("tcp", addr, 500*time.Millisecond)
		require.Error(t, err, "the port is free")
	})
	t.Run("the plain mode has no certificate pool", func(t *testing.T) {
		s := testutil.NewSMTPServer(t, testutil.SMTPOptions{})
		assert.Nil(t, s.Pool())
	})
}
