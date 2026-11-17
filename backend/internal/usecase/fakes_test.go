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

// fakeTargets is an in-memory usecase.TargetRepository. It applies the same cap and
// duplicate rules as the sentinels: the service must exist, the count comes before the
// duplicate check, and a contact is the service, the type and the value key.
type fakeTargets struct {
	services []string // ids of the services that exist
	targets  []domain.Target
	calls    int // writes attempted
}

func newFakeTargets(serviceIDs ...string) *fakeTargets { return &fakeTargets{services: serviceIDs} }

func (f *fakeTargets) serviceExists(id string) bool {
	for _, s := range f.services {
		if s == id {
			return true
		}
	}
	return false
}

func (f *fakeTargets) List(_ context.Context, serviceID string) ([]domain.Target, error) {
	if !f.serviceExists(serviceID) {
		return nil, domain.ErrNotFound
	}
	out := []domain.Target{}
	for _, t := range f.targets {
		if t.ServiceID == serviceID {
			out = append(out, t)
		}
	}
	return out, nil
}

func (f *fakeTargets) sameContact(a, b domain.Target) bool {
	return a.ServiceID == b.ServiceID && a.Type == b.Type && a.ValueKey == b.ValueKey
}

func (f *fakeTargets) Create(_ context.Context, target domain.Target, maxTargets int) error {
	f.calls++
	if !f.serviceExists(target.ServiceID) {
		return domain.ErrNotFound
	}
	n := 0
	for _, t := range f.targets {
		if t.ServiceID == target.ServiceID {
			n++
		}
	}
	if n >= maxTargets {
		return domain.ErrAlertListFull
	}
	for _, t := range f.targets {
		if f.sameContact(t, target) {
			return domain.ErrTargetDuplicate
		}
	}
	f.targets = append(f.targets, target)
	return nil
}

func (f *fakeTargets) Update(_ context.Context, target domain.Target) (domain.Target, error) {
	f.calls++
	for i, t := range f.targets {
		if t.ID != target.ID || t.ServiceID != target.ServiceID {
			continue
		}
		for _, other := range f.targets {
			if other.ID != t.ID && f.sameContact(other, target) {
				return domain.Target{}, domain.ErrTargetDuplicate
			}
		}
		target.CreatedAt, target.LastDeliveryFailed = t.CreatedAt, t.LastDeliveryFailed
		f.targets[i] = target
		return target, nil
	}
	return domain.Target{}, domain.ErrNotFound
}

func (f *fakeTargets) Delete(_ context.Context, serviceID, targetID string) error {
	f.calls++
	for i, t := range f.targets {
		if t.ID == targetID && t.ServiceID == serviceID {
			f.targets = append(f.targets[:i], f.targets[i+1:]...)
			return nil
		}
	}
	return domain.ErrNotFound
}
