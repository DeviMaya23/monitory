package repository

import (
	"context"
	"errors"

	"gorm.io/gorm"

	"monitory/internal/domain"
)

// TargetRepository reads and writes the targets table. It reads services only to know
// that a service exists.
type TargetRepository struct {
	db *gorm.DB
}

// NewTargetRepository returns a TargetRepository on db.
func NewTargetRepository(db *gorm.DB) *TargetRepository {
	return &TargetRepository{db: db}
}

// serviceExists reports whether a service with the id exists.
func serviceExists(tx *gorm.DB, id string) (bool, error) {
	var count int64
	if err := tx.Model(&domain.Service{}).Where("id = ?", id).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// List returns the service's targets ordered by created_at, then id, with times in UTC.
// It never returns nil. The service is read first (domain.ErrNotFound when none), then
// its targets, in two statements.
func (r *TargetRepository) List(ctx context.Context, serviceID string) ([]domain.Target, error) {
	db := r.db.WithContext(ctx)
	exists, err := serviceExists(db, serviceID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, domain.ErrNotFound
	}
	targets := []domain.Target{}
	if err := db.Where("service_id = ?", serviceID).Order("created_at, id").Find(&targets).Error; err != nil {
		return nil, err
	}
	for i := range targets {
		targets[i] = inUTC(targets[i])
	}
	return targets, nil
}

func inUTC(t domain.Target) domain.Target {
	t.CreatedAt, t.UpdatedAt = t.CreatedAt.UTC(), t.UpdatedAt.UTC()
	if t.Headers == nil {
		t.Headers = []domain.NameValue{}
	}
	return t
}

// Create saves target in one write transaction. The service must exist
// (domain.ErrNotFound); then the count comes first: at maxTargets targets or more it
// returns domain.ErrAlertListFull and writes nothing. The duplicate rule is the unique
// index on (service_id, type, value_key): its error is domain.ErrTargetDuplicate (FR-19, FR-88).
func (r *TargetRepository) Create(ctx context.Context, target domain.Target, maxTargets int) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		exists, err := serviceExists(tx, target.ServiceID)
		if err != nil {
			return err
		}
		if !exists {
			return domain.ErrNotFound
		}

		var count int64
		if err := tx.Model(&domain.Target{}).Where("service_id = ?", target.ServiceID).Count(&count).Error; err != nil {
			return err
		}
		if count >= int64(maxTargets) {
			return domain.ErrAlertListFull
		}

		if err := tx.Create(&target).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) {
				return domain.ErrTargetDuplicate
			}
			return err
		}
		return nil
	})
}

// Update replaces name, type, value, value_key, headers and updated_at of the target
// with the id and service id, in one write transaction, and returns the row as stored.
// id, service_id, created_at and last_delivery_failed are kept. A target that is not
// there, or belongs to another service, is domain.ErrNotFound; a contact already in the
// list is domain.ErrTargetDuplicate and the row stays as it was.
func (r *TargetRepository) Update(ctx context.Context, target domain.Target) (domain.Target, error) {
	var stored domain.Target
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("id = ? AND service_id = ?", target.ID, target.ServiceID).First(&stored).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return domain.ErrNotFound
			}
			return err
		}
		// Select names the columns written; the struct form runs the headers' serializer.
		result := tx.Model(&domain.Target{}).
			Where("id = ? AND service_id = ?", target.ID, target.ServiceID).
			Select("name", "type", "value", "value_key", "headers", "updated_at").
			Updates(target)
		if result.Error != nil {
			if errors.Is(result.Error, gorm.ErrDuplicatedKey) {
				return domain.ErrTargetDuplicate
			}
			return result.Error
		}
		return tx.Where("id = ? AND service_id = ?", target.ID, target.ServiceID).First(&stored).Error
	})
	if err != nil {
		return domain.Target{}, err
	}
	return inUTC(stored), nil
}

// Delete removes the target with one DELETE filtered by id and service id. No row
// matched is domain.ErrNotFound (FR-16).
func (r *TargetRepository) Delete(ctx context.Context, serviceID, targetID string) error {
	result := r.db.WithContext(ctx).Where("id = ? AND service_id = ?", targetID, serviceID).Delete(&domain.Target{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}
