package repository

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"monitory/internal/domain"
)

// ServiceStateRepository updates the service_states table. It never inserts: the row
// is created with the service by ServiceRepository.Create.
type ServiceStateRepository struct {
	db *gorm.DB
}

// NewServiceStateRepository returns a ServiceStateRepository on db.
func NewServiceStateRepository(db *gorm.DB) *ServiceStateRepository {
	return &ServiceStateRepository{db: db}
}

// stateColumns are every mutable column. They are named in the update so that a
// column set back to null is written; the primary key is not among them.
var stateColumns = []string{
	"status", "last_checked_at", "last_status_change_at",
	"failure_code", "failure_http_status", "failure_json_rule_field",
}

// Update reads the state row of serviceID, passes it to apply and writes the row apply
// returns, in one write transaction. Before it reads the state it reads the paused flag
// of the service in the same transaction: a service with no row in services is
// domain.ErrNotFound, and a paused one is domain.ErrServicePaused; in both nothing is
// written and apply is not called (FR-76). A service with no state row is
// domain.ErrNotFound too. The row's service id is never changed. Times are read
// and stored in UTC.
func (r *ServiceStateRepository) Update(ctx context.Context, serviceID string, apply func(domain.ServiceState) domain.ServiceState) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var service domain.Service
		if err := tx.Select("id", "paused").Where("id = ?", serviceID).Take(&service).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return domain.ErrNotFound
			}
			return err
		}
		if service.Paused {
			return domain.ErrServicePaused
		}

		var current domain.ServiceState
		if err := tx.Where("service_id = ?", serviceID).Take(&current).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return domain.ErrNotFound
			}
			return err
		}
		current.LastCheckedAt = utc(current.LastCheckedAt)
		current.LastStatusChangeAt = utc(current.LastStatusChangeAt)

		next := apply(current)
		next.LastCheckedAt = utc(next.LastCheckedAt)
		next.LastStatusChangeAt = utc(next.LastStatusChangeAt)

		return tx.Model(&domain.ServiceState{}).
			Where("service_id = ?", serviceID).
			Select(stateColumns).
			Updates(&next).Error
	})
}
