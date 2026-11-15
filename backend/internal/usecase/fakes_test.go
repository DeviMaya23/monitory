package usecase_test

import (
	"context"
	"time"
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
