package repository

import (
	"context"
	"errors"

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
