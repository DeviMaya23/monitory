package usecase_test

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/usecase"
	"monitory/pkg/clock"
)

const (
	adminUser = "admin"
	adminPass = "correct horse"
)

var authStart = time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)

type authSetup struct {
	svc      *usecase.AuthService
	sessions *fakeSessions
	clock    *clock.Fake
}

func newAuth(user, pass string, requireHTTPS bool) authSetup {
	c := clock.NewFake(authStart)
	sessions := newFakeSessions()
	return authSetup{usecase.NewAuthService(user, pass, requireHTTPS, sessions, c), sessions, c}
}

func TestAuthSignIn_CreatesSession(t *testing.T) {
	a := newAuth(adminUser, adminPass, false)

	session, err := a.svc.SignIn(context.Background(), adminUser, adminPass, true)

	require.NoError(t, err)
	assert.Equal(t, authStart.Add(domain.SessionLifetime), session.ExpiresAt)
	assert.Equal(t, map[string]domain.Session{session.Token: session}, a.sessions.sessions)
}

func TestAuthSignIn_TokensAreDistinctAndWellFormed(t *testing.T) {
	a := newAuth(adminUser, adminPass, false)
	first, err := a.svc.SignIn(context.Background(), adminUser, adminPass, true)
	require.NoError(t, err)
	second, err := a.svc.SignIn(context.Background(), adminUser, adminPass, true)
	require.NoError(t, err)

	shape := regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
	for _, token := range []string{first.Token, first.CSRFToken, second.Token, second.CSRFToken} {
		assert.Regexp(t, shape, token)
	}
	assert.NotEqual(t, first.Token, first.CSRFToken)
	assert.NotEqual(t, second.Token, second.CSRFToken)
	assert.NotEqual(t, first.Token, second.Token)
	assert.NotEqual(t, first.CSRFToken, second.CSRFToken)
	assert.Len(t, a.sessions.sessions, 2, "the earlier session stays valid")
}

func TestAuthSignIn_RejectsMismatches(t *testing.T) {
	tests := []struct{ name, username, password string }{
		{"wrong username", "root", adminPass},
		{"wrong password", adminUser, "wrong"},
		{"both wrong", "root", "wrong"},
		{"username in another letter case", "Admin", adminPass},
		{"password with a trailing space", adminUser, adminPass + " "},
		{"right password with a username of spaces", "     ", adminPass},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a := newAuth(adminUser, adminPass, false)

			_, err := a.svc.SignIn(context.Background(), tt.username, tt.password, true)

			require.ErrorIs(t, err, domain.ErrInvalidCredentials)
			assert.Empty(t, a.sessions.sessions)
		})
	}
}

func TestAuthSignIn_UsesConfiguredCredentials(t *testing.T) {
	a := newAuth("someone-else", "another secret", false)

	_, err := a.svc.SignIn(context.Background(), adminUser, adminPass, true)
	require.ErrorIs(t, err, domain.ErrInvalidCredentials)

	_, err = a.svc.SignIn(context.Background(), "someone-else", "another secret", true)
	require.NoError(t, err)
}

func TestAuthSignIn_RequiredFields(t *testing.T) {
	userErr := domain.FieldError{Field: "username", Code: domain.FieldErrorRequired, Message: "Enter the username."}
	passErr := domain.FieldError{Field: "password", Code: domain.FieldErrorRequired, Message: "Enter the password."}
	tests := []struct {
		name, username, password string
		want                     []domain.FieldError
	}{
		{"empty username", "", adminPass, []domain.FieldError{userErr}},
		{"empty password", adminUser, "", []domain.FieldError{passErr}},
		{"both empty", "", "", []domain.FieldError{userErr, passErr}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a := newAuth(adminUser, adminPass, false)

			_, err := a.svc.SignIn(context.Background(), tt.username, tt.password, true)

			var validation domain.ValidationError
			require.ErrorAs(t, err, &validation)
			assert.Equal(t, tt.want, validation.Fields)
			assert.Empty(t, a.sessions.sessions)
		})
	}
}

func TestAuthSignIn_RequireHTTPS(t *testing.T) {
	plain := []struct{ name, username, password string }{
		{"correct credentials", adminUser, adminPass},
		{"wrong credentials", "root", "wrong"},
		{"empty fields", "", ""},
	}
	for _, tt := range plain {
		t.Run("on and plain HTTP with "+tt.name, func(t *testing.T) {
			a := newAuth(adminUser, adminPass, true)

			_, err := a.svc.SignIn(context.Background(), tt.username, tt.password, false)

			require.ErrorIs(t, err, domain.ErrHTTPSRequired)
			assert.Empty(t, a.sessions.sessions)
		})
	}

	t.Run("on and HTTPS signs in", func(t *testing.T) {
		a := newAuth(adminUser, adminPass, true)
		_, err := a.svc.SignIn(context.Background(), adminUser, adminPass, true)
		require.NoError(t, err)
	})
	t.Run("off and plain HTTP signs in", func(t *testing.T) {
		a := newAuth(adminUser, adminPass, false)
		_, err := a.svc.SignIn(context.Background(), adminUser, adminPass, false)
		require.NoError(t, err)
	})
}

func TestAuthSignOut_RemovesOnlyThatSession(t *testing.T) {
	a := newAuth(adminUser, adminPass, false)
	first, err := a.svc.SignIn(context.Background(), adminUser, adminPass, true)
	require.NoError(t, err)
	second, err := a.svc.SignIn(context.Background(), adminUser, adminPass, true)
	require.NoError(t, err)

	require.NoError(t, a.svc.SignOut(context.Background(), first.Token))

	assert.Equal(t, map[string]domain.Session{second.Token: second}, a.sessions.sessions)
}
