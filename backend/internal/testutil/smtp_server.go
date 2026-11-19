package testutil

import (
	"bufio"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"fmt"
	"io"
	"math/big"
	"net"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// SMTPOptions scripts a SMTPServer. The zero value accepts every message.
type SMTPOptions struct {
	// RejectRecipient answers every RCPT TO with a 550.
	RejectRecipient bool
	// CloseAtConnect closes each connection before it sends a greeting.
	CloseAtConnect bool
	// GreetingDelay is waited, in real time, before the greeting.
	GreetingDelay time.Duration
	// Username and Password, when Username is set, make the server demand AUTH PLAIN
	// with them before it takes a message.
	Username string
	Password string
	// TLS makes the server speak implicit TLS: each connection runs a TLS handshake
	// before the greeting, with a self-signed certificate made when the server starts.
	TLS bool
	// StallHandshake (only with TLS) accepts the connection and never answers the
	// handshake: it reads and discards what arrives until the connection closes.
	StallHandshake bool
	// CertNames (only with TLS) are the DNS names or IP addresses the certificate is
	// valid for. Empty means 127.0.0.1 and localhost.
	CertNames []string
}

// SMTPMessage is one message a SMTPServer received.
type SMTPMessage struct {
	From string
	To   []string
	Data string // the DATA section as sent, dot-unstuffed, lines ended by "\r\n"
}

// SMTPServer is an in-process SMTP server for tests. It makes TLS only with
// SMTPOptions.TLS (implicit TLS), and advertises no STARTTLS, SIZE or 8BITMIME in either
// mode. It serves several connections at once.
type SMTPServer struct {
	// Host and Port are where it listens.
	Host string
	Port int

	opts     SMTPOptions
	tlsCfg   *tls.Config
	pool     *x509.CertPool
	listener net.Listener
	stop     chan struct{}
	wg       sync.WaitGroup

	mu       sync.Mutex
	messages []SMTPMessage
	conns    int
	authCmds int
	shakes   int
	conn     map[net.Conn]struct{}
}

// NewSMTPServer starts a server on a free local port. It stops at the end of the test
// and frees the port.
func NewSMTPServer(t testing.TB, opts SMTPOptions) *SMTPServer {
	t.Helper()
	l, err := (&net.ListenConfig{}).Listen(context.Background(), "tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("smtp server: listen: %v", err)
	}
	addr := l.Addr().(*net.TCPAddr)
	s := &SMTPServer{
		Host: "127.0.0.1", Port: addr.Port, opts: opts, listener: l,
		stop: make(chan struct{}), conn: map[net.Conn]struct{}{},
	}
	if opts.TLS {
		s.tlsCfg, s.pool = newTLSConfig(t, opts.CertNames)
	}
	s.wg.Add(1)
	go s.accept()
	t.Cleanup(s.close)
	return s
}

// Messages returns the messages received so far.
func (s *SMTPServer) Messages() []SMTPMessage {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]SMTPMessage(nil), s.messages...)
}

// Connections returns how many connections were made.
func (s *SMTPServer) Connections() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.conns
}

// AuthCommands returns how many AUTH commands the server saw.
func (s *SMTPServer) AuthCommands() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.authCmds
}

// Handshakes returns how many TLS handshakes the server completed.
func (s *SMTPServer) Handshakes() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.shakes
}

// Pool returns a pool that trusts the server's certificate. It is nil without TLS.
func (s *SMTPServer) Pool() *x509.CertPool { return s.pool }

// newTLSConfig makes a self-signed ECDSA P-256 certificate, valid from a minute ago for
// an hour, for names (127.0.0.1 and localhost when empty).
func newTLSConfig(t testing.TB, names []string) (*tls.Config, *x509.CertPool) {
	t.Helper()
	if len(names) == 0 {
		names = []string{"127.0.0.1", "localhost"}
	}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("smtp server: key: %v", err)
	}
	now := time.Now()
	tmpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "smtp test server"},
		NotBefore:             now.Add(-time.Minute),
		NotAfter:              now.Add(time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IsCA:                  true,
	}
	for _, n := range names {
		if ip := net.ParseIP(n); ip != nil {
			tmpl.IPAddresses = append(tmpl.IPAddresses, ip)
		} else {
			tmpl.DNSNames = append(tmpl.DNSNames, n)
		}
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("smtp server: certificate: %v", err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("smtp server: parse certificate: %v", err)
	}
	pool := x509.NewCertPool()
	pool.AddCert(cert)
	return &tls.Config{
		Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: key}},
		MinVersion:   tls.VersionTLS12,
	}, pool
}

func (s *SMTPServer) close() {
	close(s.stop)
	_ = s.listener.Close()
	s.mu.Lock()
	for c := range s.conn {
		_ = c.Close()
	}
	s.mu.Unlock()
	s.wg.Wait()
}

func (s *SMTPServer) accept() {
	defer s.wg.Done()
	for {
		c, err := s.listener.Accept()
		if err != nil {
			return
		}
		s.mu.Lock()
		s.conns++
		s.conn[c] = struct{}{}
		s.mu.Unlock()
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			defer func() {
				_ = c.Close()
				s.mu.Lock()
				delete(s.conn, c)
				s.mu.Unlock()
			}()
			s.serve(c)
		}()
	}
}

func (s *SMTPServer) serve(c net.Conn) {
	if s.opts.CloseAtConnect {
		return
	}
	if s.opts.TLS {
		if s.opts.StallHandshake {
			_, _ = io.Copy(io.Discard, c)
			return
		}
		tc := tls.Server(c, s.tlsCfg)
		if err := tc.HandshakeContext(context.Background()); err != nil {
			return
		}
		s.mu.Lock()
		s.shakes++
		s.mu.Unlock()
		c = tc
	}
	if s.opts.GreetingDelay > 0 {
		select {
		case <-time.After(s.opts.GreetingDelay):
		case <-s.stop:
			return
		}
	}
	r := bufio.NewReader(c)
	reply := func(format string, args ...any) bool {
		_, err := fmt.Fprintf(c, format+"\r\n", args...)
		return err == nil
	}
	if !reply("220 test.local ESMTP ready") {
		return
	}

	var (
		from          string
		rcpts         []string
		authenticated = s.opts.Username == ""
	)
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return
		}
		line = strings.TrimRight(line, "\r\n")
		verb, arg, _ := strings.Cut(line, " ")
		switch strings.ToUpper(verb) {
		case "EHLO":
			if s.opts.Username != "" {
				reply("250-test.local\r\n250 AUTH PLAIN")
			} else {
				reply("250 test.local")
			}
		case "HELO":
			reply("250 test.local")
		case "AUTH":
			s.mu.Lock()
			s.authCmds++
			s.mu.Unlock()
			if s.opts.Username == "" {
				reply("502 5.5.1 authentication is not enabled")
				continue
			}
			mech, initial, _ := strings.Cut(arg, " ")
			if !strings.EqualFold(mech, "PLAIN") {
				reply("504 5.5.4 mechanism not supported")
				continue
			}
			if initial == "" {
				reply("334 ")
				resp, err := r.ReadString('\n')
				if err != nil {
					return
				}
				initial = strings.TrimRight(resp, "\r\n")
			}
			if s.checkPlain(initial) {
				authenticated = true
				reply("235 2.7.0 authenticated")
			} else {
				reply("535 5.7.8 authentication failed")
			}
		case "MAIL":
			if !authenticated {
				reply("530 5.7.0 authentication required")
				continue
			}
			from = angle(arg)
			rcpts = nil
			reply("250 ok")
		case "RCPT":
			if s.opts.RejectRecipient {
				reply("550 5.1.1 no such user")
				continue
			}
			rcpts = append(rcpts, angle(arg))
			reply("250 ok")
		case "DATA":
			if len(rcpts) == 0 {
				reply("503 5.5.1 need RCPT first")
				continue
			}
			reply("354 end data with <CR><LF>.<CR><LF>")
			data, err := readData(r)
			if err != nil {
				return
			}
			s.mu.Lock()
			s.messages = append(s.messages, SMTPMessage{From: from, To: rcpts, Data: data})
			s.mu.Unlock()
			from, rcpts = "", nil
			reply("250 ok queued")
		case "RSET":
			from, rcpts = "", nil
			reply("250 ok")
		case "NOOP":
			reply("250 ok")
		case "QUIT":
			reply("221 bye")
			return
		default:
			reply("502 5.5.2 command not recognized")
		}
	}
}

func (s *SMTPServer) checkPlain(b64 string) bool {
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return false
	}
	parts := strings.Split(string(raw), "\x00")
	return len(parts) == 3 && parts[1] == s.opts.Username && parts[2] == s.opts.Password
}

// angle returns the address inside the <> of "FROM:<a@b> PARAMS" or "TO:<a@b>".
func angle(arg string) string {
	_, rest, _ := strings.Cut(arg, ":")
	rest = strings.TrimSpace(rest)
	if start := strings.IndexByte(rest, '<'); start >= 0 {
		if end := strings.IndexByte(rest[start:], '>'); end > 0 {
			return rest[start+1 : start+end]
		}
	}
	return rest
}

// readData reads a DATA section up to the line holding only a dot, undoing dot-stuffing.
func readData(r *bufio.Reader) (string, error) {
	var b strings.Builder
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			return "", err
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "." {
			return b.String(), nil
		}
		line = strings.TrimPrefix(line, ".")
		b.WriteString(line)
		b.WriteString("\r\n")
	}
}

// Addr returns "host:port".
func (s *SMTPServer) Addr() string { return net.JoinHostPort(s.Host, strconv.Itoa(s.Port)) }
