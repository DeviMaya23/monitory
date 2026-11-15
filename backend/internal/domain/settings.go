package domain

import "time"

// AppSettingsID is the id of the one row of app_settings.
const AppSettingsID = 1

// AppSettings is the app-wide settings the admin changes in the app (table
// app_settings, always exactly one row).
type AppSettings struct {
	ID                int       `gorm:"column:id;primaryKey"`
	PublicViewEnabled bool      `gorm:"column:public_view_enabled"` // FR-26: off by default
	UpdatedAt         time.Time `gorm:"column:updated_at;autoUpdateTime:false"`
}

// TableName is the table AppSettings is stored in.
func (AppSettings) TableName() string { return "app_settings" }
