package memstore

import (
	"sync"

	"monitory/internal/domain"
	"monitory/pkg/clock"
)

// Sessions holds the signed-in sessions in memory. It is empty at every start
// (FR-114) and safe for concurrent use.
type Sessions struct {
	clock clock.Clock

	mu       sync.Mutex
	sessions map[string]domain.Session
}

// NewSessions returns an empty store.
func NewSessions(clock clock.Clock) *Sessions {
	return &Sessions{clock: clock, sessions: map[string]domain.Session{}}
}

// Put stores a session under its token and removes every expired session.
func (s *Sessions) Put(session domain.Session) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.clock.Now()
	for token, other := range s.sessions {
		if !now.Before(other.ExpiresAt) {
			delete(s.sessions, token)
		}
	}
	s.sessions[session.Token] = session
}

// Delete removes the session with this token, if any.
func (s *Sessions) Delete(token string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, token)
}

// Session returns the session with this token. A session is valid while the clock is
// before its ExpiresAt (FR-5); an expired one is removed and not found. A lookup never
// changes ExpiresAt.
func (s *Sessions) Session(token string) (domain.Session, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.sessions[token]
	if !ok {
		return domain.Session{}, false
	}
	if !s.clock.Now().Before(session.ExpiresAt) {
		delete(s.sessions, token)
		return domain.Session{}, false
	}
	return session, true
}

// Len returns how many sessions the store holds, expired ones included.
func (s *Sessions) Len() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.sessions)
}
