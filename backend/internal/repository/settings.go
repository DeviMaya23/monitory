// Package repository is the SQLite access layer. It implements the interfaces the
// usecase layer defines, without importing it.
package repository

import (
	"context"
	"time"

	"gorm.io/gorm"

	"monitory/internal/domain"
)

// SettingsRepository reads and writes the one row of app_settings.
type SettingsRepository struct {
	db *gorm.DB
}

// NewSettingsRepository returns a SettingsRepository on db.
func NewSettingsRepository(db *gorm.DB) *SettingsRepository {
	return &SettingsRepository{db: db}
}

// PublicViewEnabled reports whether the public view is on.
func (r *SettingsRepository) PublicViewEnabled(ctx context.Context) (bool, error) {
	var settings domain.AppSettings
	if err := r.db.WithContext(ctx).First(&settings, domain.AppSettingsID).Error; err != nil {
		return false, err
	}
	return settings.PublicViewEnabled, nil
}

// SetPublicViewEnabled turns the public view on or off, as of at.
func (r *SettingsRepository) SetPublicViewEnabled(ctx context.Context, enabled bool, at time.Time) error {
	result := r.db.WithContext(ctx).
		Model(&domain.AppSettings{}).
		Where("id = ?", domain.AppSettingsID).
		Updates(map[string]any{"public_view_enabled": enabled, "updated_at": at.UTC()})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
