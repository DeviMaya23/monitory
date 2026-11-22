package mailer

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"io"
	"net"
	"net/textproto"
	"os"

	mail "github.com/wneessen/go-mail"
)

// The causes of a failed send. They are fixed words for the log: none holds an address,
// a host or any text of the error they were made from.
const (
	causeCouldNotConnect  = "could not connect"
	causeTLSFailed        = "TLS failed"
	causeLoginNeedsTLS    = "login needs TLS"
	causeLoginRefused     = "login refused"
	causeSenderRefused    = "sender refused"
	causeRecipientRefused = "recipient refused"
	causeMessageRefused   = "message refused"
	causeInvalidAddress   = "invalid address"
	causeTimedOut         = "timed out"
	causeOther            = "other"
)

// classify names the cause of a failed send from the error go-mail returned, the TLS
// mode, and whether the attempt's own deadline had passed when the send returned (the end
// of the attempt closes the connection, so go-mail may report net.ErrClosed instead of a
// deadline error). It decides by error type or value, never by the text of a message,
// and searches the whole error tree; the first rule that matches anywhere decides.
func classify(err error, mode string, deadlinePassed bool) string {
	if deadlinePassed || errors.Is(err, context.DeadlineExceeded) || errors.Is(err, os.ErrDeadlineExceeded) {
		return causeTimedOut
	}
	if isTLSFailure(err) {
		return causeTLSFailed
	}
	if mode == tlsNone && errors.Is(err, mail.ErrNoSupportedAuthDiscovered) {
		return causeLoginNeedsTLS
	}
	var proto *textproto.Error
	if errors.As(err, &proto) {
		switch proto.Code {
		case 530, 534, 535, 538:
			return causeLoginRefused
		}
	}
	var sendErr *mail.SendError
	if errors.As(err, &sendErr) {
		switch sendErr.Reason {
		case mail.ErrSMTPMailFrom:
			return causeSenderRefused
		case mail.ErrSMTPRcptTo:
			return causeRecipientRefused
		case mail.ErrSMTPData, mail.ErrSMTPDataClose, mail.ErrWriteContent:
			return causeMessageRefused
		}
	}
	var opErr *net.OpError
	if errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) || errors.As(err, &opErr) {
		if !isTimeout(err) {
			return causeCouldNotConnect
		}
	}
	return causeOther
}

func isTLSFailure(err error) bool {
	var verify *tls.CertificateVerificationError
	var unknown x509.UnknownAuthorityError
	var host x509.HostnameError
	var record tls.RecordHeaderError
	return errors.As(err, &verify) || errors.As(err, &unknown) ||
		errors.As(err, &host) || errors.As(err, &record)
}

func isTimeout(err error) bool {
	var ne net.Error
	return errors.As(err, &ne) && ne.Timeout()
}
