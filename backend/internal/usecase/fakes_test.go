package usecase_test

import (
	"context"
	"time"

	"monitory/internal/domain"
)

// fakeSettings is an in-memory usecase.SettingsRepository.
type fakeSettings struct {
	publicViewEnabled bool
	updatedAt         time.Time
}

func (f *fakeSettings) PublicViewEnabled(context.Context) (bool, error) {
	return f.publicViewEnabled, nil
}

func (f *fakeSettings) SetPublicViewEnabled(_ context.Context, enabled bool, at time.Time) error {
	f.publicViewEnabled = enabled
	f.updatedAt = at
	return nil
}

// fakeSessions is an in-memory usecase.SessionStore.
type fakeSessions struct {
	sessions map[string]domain.Session
}

func newFakeSessions() *fakeSessions {
	return &fakeSessions{sessions: map[string]domain.Session{}}
}

func (f *fakeSessions) Put(session domain.Session) { f.sessions[session.Token] = session }
func (f *fakeSessions) Delete(token string)        { delete(f.sessions, token) }
