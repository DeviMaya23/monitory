package usecase_test

import (
	"context"
	"runtime"
	"time"

	"monitory/internal/domain"
)

// fakeSettings is an in-memory usecase.SettingsRepository.
type fakeSettings struct {
	publicViewEnabled bool
	updatedAt         time.Time
	// err, when set, is what PublicViewEnabled returns.
	err error
	// reads counts the calls to PublicViewEnabled.
	reads int
}

func (f *fakeSettings) PublicViewEnabled(context.Context) (bool, error) {
	f.reads++
	if f.err != nil {
		return false, f.err
	}
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

	// states holds the state of each service, for Get and Update; a service with none
	// is not yet checked.
	states  map[string]domain.ServiceState
	updates []domain.Service // the rows Update was called with

	pauseCalls []pauseCall // the calls of SetPaused
	// unchanged, when true, makes SetPaused report changed false whatever the flag is.
	unchanged bool
}

// pauseCall is one call of SetPaused.
type pauseCall struct {
	id     string
	paused bool
	at     time.Time
}

// seedState sets the state the repository keeps for a service.
func (f *fakeServices) seedState(state domain.ServiceState) {
	if f.states == nil {
		f.states = map[string]domain.ServiceState{}
	}
	f.states[state.ServiceID] = state
}

func (f *fakeServices) view(s domain.Service) domain.ServiceView {
	state, ok := f.states[s.ID]
	if !ok {
		state = domain.ServiceState{ServiceID: s.ID, Status: domain.StatusNotYetChecked}
	}
	return domain.ServiceView{Service: s, State: state}
}

// yield lets other goroutines run, so that a missing mutex in the caller shows up.
func yield() {
	for range 5 {
		runtime.Gosched()
	}
}

// Get returns the service with the id, or domain.ErrNotFound.
func (f *fakeServices) Get(_ context.Context, id string) (domain.ServiceView, error) {
	if f.err != nil {
		return domain.ServiceView{}, f.err
	}
	for _, s := range f.services {
		if s.ID == id {
			return f.view(s), nil
		}
	}
	return domain.ServiceView{}, domain.ErrNotFound
}

// Update replaces the editable settings of the stored service. It keeps the stored
// created_at, paused flag and state, as the real repository does, and applies its name
// rule: another service with the same name key is domain.ErrServiceNameTaken.
func (f *fakeServices) Update(_ context.Context, service domain.Service) (domain.ServiceView, error) {
	f.updates = append(f.updates, service)
	if f.events != nil {
		*f.events = append(*f.events, "update")
	}
	defer yield()
	if f.err != nil {
		return domain.ServiceView{}, f.err
	}
	for _, other := range f.services {
		if other.ID != service.ID && other.NameKey != "" && other.NameKey == service.NameKey {
			return domain.ServiceView{}, domain.ErrServiceNameTaken
		}
	}
	for i, stored := range f.services {
		if stored.ID == service.ID {
			service.CreatedAt, service.Paused = stored.CreatedAt, stored.Paused
			f.services[i] = service
			return f.view(service), nil
		}
	}
	return domain.ServiceView{}, domain.ErrNotFound
}

// SetPaused sets the stored flag as the real repository does: the stored state is
// returned as it is, and changed is false when the flag already had the value. It
// yields between its write and its return, so that a caller without a mutex shows up.
func (f *fakeServices) SetPaused(_ context.Context, id string, paused bool, at time.Time) (domain.ServiceView, bool, error) {
	f.pauseCalls = append(f.pauseCalls, pauseCall{id, paused, at})
	if f.err != nil {
		return domain.ServiceView{}, false, f.err
	}
	for i, stored := range f.services {
		if stored.ID != id {
			continue
		}
		changed := stored.Paused != paused && !f.unchanged
		if changed {
			f.services[i].Paused, f.services[i].UpdatedAt = paused, at
		}
		if f.events != nil {
			*f.events = append(*f.events, "set-paused")
		}
		view := f.view(f.services[i])
		yield()
		return view, changed, nil
	}
	return domain.ServiceView{}, false, domain.ErrNotFound
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
	defer yield()
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
	started   []domain.Service
	restarted []restartCall
	stopped   []string
	events    *[]string
}

func (f *fakeScheduler) Stop(serviceID string) {
	f.stopped = append(f.stopped, serviceID)
	if f.events != nil {
		*f.events = append(*f.events, "stop")
	}
}

// restartCall is one call of Restart.
type restartCall struct {
	service domain.Service
	at      time.Time
}

func (f *fakeScheduler) Restart(service domain.Service, firstCheckAt time.Time) {
	f.restarted = append(f.restarted, restartCall{service, firstCheckAt})
	if f.events != nil {
		*f.events = append(*f.events, "restart")
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

// fakeLimiter is a usecase.RateLimiter that answers as scripted and records the keys.
type fakeLimiter struct {
	allowed bool
	wait    time.Duration
	keys    []string
}

func (f *fakeLimiter) Allow(key string) (bool, time.Duration) {
	f.keys = append(f.keys, key)
	return f.allowed, f.wait
}

// fakePublicServices is a usecase.PublicServiceRepository.
type fakePublicServices struct {
	services []domain.PublicService
	err      error
	reads    int
}

func (f *fakePublicServices) ListPublic(context.Context) ([]domain.PublicService, error) {
	f.reads++
	return f.services, f.err
}
