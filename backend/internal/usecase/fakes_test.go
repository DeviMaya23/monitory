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

// fakeServices is an in-memory usecase.ServiceRepository. It records its writes and
// the scheduler's calls in one list, so a test can assert their order.
type fakeServices struct {
	services    []domain.Service
	maxServices []int
	err         error
	events      *[]string
	deleted     []string
}

func (f *fakeServices) List(context.Context) ([]domain.ServiceView, error) {
	views := make([]domain.ServiceView, len(f.services))
	for i, s := range f.services {
		views[i] = domain.ServiceView{Service: s}
	}
	return views, f.err
}

// Delete removes the service with the id, or returns domain.ErrNotFound.
func (f *fakeServices) Delete(_ context.Context, id string) error {
	if f.err != nil {
		return f.err
	}
	for i, s := range f.services {
		if s.ID == id {
			f.services = append(f.services[:i], f.services[i+1:]...)
			f.deleted = append(f.deleted, id)
			if f.events != nil {
				*f.events = append(*f.events, "delete")
			}
			return nil
		}
	}
	return domain.ErrNotFound
}

func (f *fakeServices) Create(_ context.Context, service domain.Service, maxServices int) error {
	f.maxServices = append(f.maxServices, maxServices)
	if f.err != nil {
		return f.err
	}
	f.services = append(f.services, service)
	if f.events != nil {
		*f.events = append(*f.events, "create")
	}
	return nil
}

// fakeScheduler is a usecase.Scheduler that records what it was started with.
type fakeScheduler struct {
	started []domain.Service
	stopped []string
	events  *[]string
}

func (f *fakeScheduler) Stop(serviceID string) {
	f.stopped = append(f.stopped, serviceID)
	if f.events != nil {
		*f.events = append(*f.events, "stop")
	}
}

func (f *fakeScheduler) Start(service domain.Service) {
	f.started = append(f.started, service)
	if f.events != nil {
		*f.events = append(*f.events, "start")
	}
}
