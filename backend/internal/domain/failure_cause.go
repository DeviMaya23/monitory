package domain

import "errors"

// FailureCauser is implemented by an error that carries a fixed, short cause of a
// failure for the log. A cause holds no address, host, URL or message text.
type FailureCauser interface {
	FailureCause() string
}

// FailureCause returns the cause carried by err or by an error it wraps (the first one
// found), or "" when there is none.
func FailureCause(err error) string {
	var c FailureCauser
	if errors.As(err, &c) {
		return c.FailureCause()
	}
	return ""
}
