package usecase

import (
	"context"
	"time"
)

// SettingsRepository stores the app-wide settings.
type SettingsRepository interface {
	PublicViewEnabled(ctx context.Context) (bool, error)
	SetPublicViewEnabled(ctx context.Context, enabled bool, at time.Time) error
}

// SettingsService reads and changes the app-wide settings the admin controls.
type SettingsService struct {
	settings SettingsRepository
	clock    Clock
}

// NewSettingsService returns a SettingsService.
func NewSettingsService(settings SettingsRepository, clock Clock) *SettingsService {
	return &SettingsService{settings: settings, clock: clock}
}

// PublicViewEnabled reports whether the public view is on (FR-26).
func (s *SettingsService) PublicViewEnabled(ctx context.Context) (bool, error) {
	return s.settings.PublicViewEnabled(ctx)
}

// SetPublicViewEnabled turns the public view on or off (FR-26), stamped with the
// current time.
func (s *SettingsService) SetPublicViewEnabled(ctx context.Context, enabled bool) error {
	return s.settings.SetPublicViewEnabled(ctx, enabled, s.clock.Now())
}
