package repository

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"

	"monitory/internal/domain"
)

// ServiceRepository reads and writes the services and service_states tables.
type ServiceRepository struct {
	db *gorm.DB
}

// NewServiceRepository returns a ServiceRepository on db.
func NewServiceRepository(db *gorm.DB) *ServiceRepository {
	return &ServiceRepository{db: db}
}

// Create saves service and its state row (status not_yet_checked) in one write
// transaction. The count comes first: at maxServices services or more it returns
// domain.ErrServiceLimitReached and writes nothing. The name rule is the unique index
// on name_key; when the insert fails as a duplicate, a query in the same transaction
// tells a name clash (domain.ErrServiceNameTaken) from any other duplicate, which is
// returned as it is (FR-59, FR-60).
func (r *ServiceRepository) Create(ctx context.Context, service domain.Service, maxServices int) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&domain.Service{}).Count(&count).Error; err != nil {
			return err
		}
		if count >= int64(maxServices) {
			return domain.ErrServiceLimitReached
		}

		if err := tx.Create(&service).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) {
				var sameName int64
				if countErr := tx.Model(&domain.Service{}).Where("name_key = ?", service.NameKey).Count(&sameName).Error; countErr != nil {
					return countErr
				}
				if sameName > 0 {
					return domain.ErrServiceNameTaken
				}
			}
			return err
		}

		state := domain.ServiceState{ServiceID: service.ID, Status: domain.StatusNotYetChecked}
		return tx.Create(&state).Error
	})
}

// serviceRow is one row of the list query: the service, its state and the two values
// computed from targets.
type serviceRow struct {
	domain.Service      `gorm:"embedded"`
	domain.ServiceState `gorm:"embedded"`
	TargetCount         int  `gorm:"column:target_count"`
	AlertDeliveryFailed bool `gorm:"column:alert_delivery_failed"`
}

// listServicesSQL reads every service with its state, its target count and whether a
// delivery to one of its targets failed, in one statement so that the rows are
// consistent. The order is the contract's: name ignoring case (name_key), then id.
const listServicesSQL = `
SELECT services.*, service_states.*,
       (SELECT COUNT(*) FROM targets WHERE targets.service_id = services.id) AS target_count,
       EXISTS (SELECT 1 FROM targets
               WHERE targets.service_id = services.id AND targets.last_delivery_failed) AS alert_delivery_failed
FROM services
JOIN service_states ON service_states.service_id = services.id
ORDER BY services.name_key, services.id`

// List returns every service with its state, ordered by name_key, then id (FR-9). Times
// are in UTC. It never returns nil.
func (r *ServiceRepository) List(ctx context.Context) ([]domain.ServiceView, error) {
	var rows []serviceRow
	if err := r.db.WithContext(ctx).Raw(listServicesSQL).Scan(&rows).Error; err != nil {
		return nil, err
	}
	views := make([]domain.ServiceView, len(rows))
	for i, row := range rows {
		row.Service.CreatedAt, row.Service.UpdatedAt = row.Service.CreatedAt.UTC(), row.Service.UpdatedAt.UTC()
		row.ServiceState.LastCheckedAt = utc(row.ServiceState.LastCheckedAt)
		row.ServiceState.LastStatusChangeAt = utc(row.ServiceState.LastStatusChangeAt)
		views[i] = domain.ServiceView{
			Service:             row.Service,
			State:               row.ServiceState,
			TargetCount:         row.TargetCount,
			AlertDeliveryFailed: row.AlertDeliveryFailed,
		}
	}
	return views, nil
}

func utc(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}

// Delete removes the service with one DELETE; the state row and the targets go with it
// through the foreign keys' cascade (FR-70). It returns domain.ErrNotFound when no row
// matched.
func (r *ServiceRepository) Delete(ctx context.Context, id string) error {
	result := r.db.WithContext(ctx).Where("id = ?", id).Delete(&domain.Service{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}
