package usecase_test

import (
	"context"

	"monitory/internal/domain"
)

// fakeStates is an in-memory usecase.ServiceStateRepository. A state is held by service
// id; err, when set, is returned by Update before anything is applied.
type fakeStates struct {
	states map[string]domain.ServiceState
	err    error
	// afterApply, when set, receives the context Update was given and runs once the
	// change is applied.
	afterApply func(ctx context.Context)
}

func newFakeStates(states ...domain.ServiceState) *fakeStates {
	f := &fakeStates{states: map[string]domain.ServiceState{}}
	for _, s := range states {
		f.states[s.ServiceID] = s
	}
	return f
}

func (f *fakeStates) Update(ctx context.Context, id string, apply func(domain.ServiceState) domain.ServiceState) error {
	if f.err != nil {
		return f.err
	}
	state, ok := f.states[id]
	if !ok {
		return domain.ErrNotFound
	}
	f.states[id] = apply(state)
	if f.afterApply != nil {
		f.afterApply(ctx)
	}
	return nil
}

// fakeFinder is a usecase service finder. A service is held by id; one that is not held
// answers domain.ErrNotFound. ctxErrs records ctx.Err() as it was at each call.
type fakeFinder struct {
	services map[string]domain.Service
	err      error
	ctxErrs  []error
}

func newFakeFinder(services ...domain.Service) *fakeFinder {
	f := &fakeFinder{services: map[string]domain.Service{}}
	for _, s := range services {
		f.services[s.ID] = s
	}
	return f
}

func (f *fakeFinder) Find(ctx context.Context, id string) (domain.Service, error) {
	f.ctxErrs = append(f.ctxErrs, ctx.Err())
	if f.err != nil {
		return domain.Service{}, f.err
	}
	s, ok := f.services[id]
	if !ok {
		return domain.Service{}, domain.ErrNotFound
	}
	return s, nil
}

// fakeLister is a usecase target lister. Targets are held by service id; a service that
// is not held answers domain.ErrNotFound. ctxErrs records ctx.Err() at each call.
type fakeLister struct {
	targets map[string][]domain.Target
	err     error
	ctxErrs []error
}

func newFakeLister(serviceID string, targets ...domain.Target) *fakeLister {
	return &fakeLister{targets: map[string][]domain.Target{serviceID: targets}}
}

func (f *fakeLister) List(ctx context.Context, serviceID string) ([]domain.Target, error) {
	f.ctxErrs = append(f.ctxErrs, ctx.Err())
	if f.err != nil {
		return nil, f.err
	}
	targets, ok := f.targets[serviceID]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return targets, nil
}

type dispatchCall struct {
	alert   domain.Alert
	targets []domain.Target
	// stateAtCall is the saved state of each service when Dispatch was called.
	stateAtCall map[string]domain.ServiceState
}

// spyDispatcher records every Dispatch. When states is set, it copies them at the call.
type spyDispatcher struct {
	calls  []dispatchCall
	states *fakeStates
}

func (d *spyDispatcher) Dispatch(alert domain.Alert, targets []domain.Target) {
	call := dispatchCall{alert: alert, targets: targets}
	if d.states != nil {
		call.stateAtCall = map[string]domain.ServiceState{}
		for id, st := range d.states.states {
			call.stateAtCall[id] = st
		}
	}
	d.calls = append(d.calls, call)
}
