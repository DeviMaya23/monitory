package mailer

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/textproto"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	mail "github.com/wneessen/go-mail"
)

func TestClassify(t *testing.T) {
	closed := &net.OpError{Op: "read", Err: net.ErrClosed}
	sendErr := func(r mail.SendErrReason) error { return &mail.SendError{Reason: r} }
	tests := []struct {
		name     string
		err      error
		mode     string
		deadline bool
		want     string
	}{
		{"context deadline", context.DeadlineExceeded, tlsNone, false, "timed out"},
		{"os deadline", os.ErrDeadlineExceeded, tlsNone, false, "timed out"},
		{"closed connection after the deadline", closed, tlsNone, true, "timed out"},
		{"closed connection before the deadline", closed, tlsNone, false, "could not connect"},
		{"EOF", io.EOF, tlsNone, false, "could not connect"},
		{"login 530", &textproto.Error{Code: 530}, tlsNone, false, "login refused"},
		{"login 534", &textproto.Error{Code: 534}, tlsNone, false, "login refused"},
		{"login 535", &textproto.Error{Code: 535}, tlsNone, false, "login refused"},
		{"login 538", &textproto.Error{Code: 538}, tlsNone, false, "login refused"},
		{"another code", &textproto.Error{Code: 554}, tlsNone, false, "other"},
		{"no auth, none", mail.ErrNoSupportedAuthDiscovered, tlsNone, false, "login needs TLS"},
		{"no auth, tls", mail.ErrNoSupportedAuthDiscovered, tlsImplicit, false, "other"},
		{"no auth, starttls", mail.ErrNoSupportedAuthDiscovered, tlsStartTLS, false, "other"},
		{"mail from", sendErr(mail.ErrSMTPMailFrom), tlsNone, false, "sender refused"},
		{"rcpt to", sendErr(mail.ErrSMTPRcptTo), tlsNone, false, "recipient refused"},
		{"data", sendErr(mail.ErrSMTPData), tlsNone, false, "message refused"},
		{"data close", sendErr(mail.ErrSMTPDataClose), tlsNone, false, "message refused"},
		{"write content", sendErr(mail.ErrWriteContent), tlsNone, false, "message refused"},
		{"reset", sendErr(mail.ErrSMTPReset), tlsNone, false, "other"},
		{"get sender", sendErr(mail.ErrGetSender), tlsNone, false, "other"},
		{"get recipients", sendErr(mail.ErrGetRcpts), tlsNone, false, "other"},
		{"conn check", sendErr(mail.ErrConnCheck), tlsNone, false, "other"},
		{"no unencoded", sendErr(mail.ErrNoUnencoded), tlsNone, false, "other"},
		{"ambiguous", sendErr(mail.ErrAmbiguous), tlsNone, false, "other"},
		{"unknown error", errors.New("something else"), tlsNone, false, "other"},
		{"close error joined with a recipient error", fmt.Errorf("send: %w", errors.Join(net.ErrClosed, sendErr(mail.ErrSMTPRcptTo))), tlsNone, false, "recipient refused"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, classify(tt.err, tt.mode, tt.deadline))
		})
	}
}
