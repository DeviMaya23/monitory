package usecase

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"

	"monitory/internal/domain"
)

// tokenBytes is the size of a session token and of a CSRF token (NFR-8).
const tokenBytes = 32

// SessionStore keeps the signed-in sessions. It is in memory, so it has no context and
// no errors (FR-114).
type SessionStore interface {
	Put(session domain.Session)
	Delete(token string)
}

// AuthService signs the admin in and out (FR-1, FR-3).
type AuthService struct {
	username     string
	password     string
	requireHTTPS bool
	sessions     SessionStore
	clock        Clock
}

// NewAuthService returns an AuthService for the configured credentials.
func NewAuthService(username, password string, requireHTTPS bool, sessions SessionStore, clock Clock) *AuthService {
	return &AuthService{username: username, password: password, requireHTTPS: requireHTTPS, sessions: sessions, clock: clock}
}

// SignIn checks, in this order: the scheme (FR-97), the required fields, the
// credentials (FR-1), then creates a session (FR-5). The error is
// domain.ErrHTTPSRequired, a domain.ValidationError or domain.ErrInvalidCredentials.
func (a *AuthService) SignIn(_ context.Context, username, password string, https bool) (domain.Session, error) {
	if a.requireHTTPS && !https {
		return domain.Session{}, domain.ErrHTTPSRequired
	}

	var fields []domain.FieldError
	if username == "" {
		fields = append(fields, domain.FieldError{Field: "username", Code: domain.FieldErrorRequired, Message: "Enter the username."})
	}
	if password == "" {
		fields = append(fields, domain.FieldError{Field: "password", Code: domain.FieldErrorRequired, Message: "Enter the password."})
	}
	if len(fields) > 0 {
		return domain.Session{}, domain.ValidationError{Fields: fields}
	}

	// Both are always compared, on fixed-length digests, and the two results are
	// combined without a branch between them (FR-1).
	userOK := equalDigest(username, a.username)
	passOK := equalDigest(password, a.password)
	if userOK&passOK != 1 {
		return domain.Session{}, domain.ErrInvalidCredentials
	}

	token, err := newToken()
	if err != nil {
		return domain.Session{}, err
	}
	csrf, err := newToken()
	if err != nil {
		return domain.Session{}, err
	}
	session := domain.Session{
		Token:     token,
		CSRFToken: csrf,
		ExpiresAt: a.clock.Now().Add(domain.SessionLifetime),
	}
	a.sessions.Put(session)
	return session, nil
}

// SignOut ends the session with this token (FR-3).
func (a *AuthService) SignOut(_ context.Context, token string) error {
	a.sessions.Delete(token)
	return nil
}

// equalDigest returns 1 when the SHA-256 digests of a and b are equal, in constant
// time, whatever the lengths of a and b.
func equalDigest(a, b string) int {
	da, db := sha256.Sum256([]byte(a)), sha256.Sum256([]byte(b))
	return subtle.ConstantTimeCompare(da[:], db[:])
}

// newToken returns 32 random bytes as unpadded URL-safe base64 (43 characters).
func newToken() (string, error) {
	b := make([]byte, tokenBytes)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("read random bytes: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
