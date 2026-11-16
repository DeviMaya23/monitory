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
}

func newFakeStates(states ...domain.ServiceState) *fakeStates {
	f := &fakeStates{states: map[string]domain.ServiceState{}}
	for _, s := range states {
		f.states[s.ServiceID] = s
	}
	return f
}

func (f *fakeStates) Update(_ context.Context, id string, apply func(domain.ServiceState) domain.ServiceState) error {
	if f.err != nil {
		return f.err
	}
	state, ok := f.states[id]
	if !ok {
		return domain.ErrNotFound
	}
	f.states[id] = apply(state)
	return nil
}
