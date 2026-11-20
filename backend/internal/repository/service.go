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

// Find returns the service as saved, without its state, times in UTC. It returns
// domain.ErrNotFound when no row has that id and writes nothing.
func (r *ServiceRepository) Find(ctx context.Context, id string) (domain.Service, error) {
	var service domain.Service
	err := r.db.WithContext(ctx).Where("id = ?", id).Take(&service).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return domain.Service{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.Service{}, err
	}
	service.CreatedAt, service.UpdatedAt = service.CreatedAt.UTC(), service.UpdatedAt.UTC()
	return service, nil
}

// serviceRow is one row of the list query: the service, its state and the two values
// computed from targets.
type serviceRow struct {
	domain.Service      `gorm:"embedded"`
	domain.ServiceState `gorm:"embedded"`
	TargetCount         int  `gorm:"column:target_count"`
	AlertDeliveryFailed bool `gorm:"column:alert_delivery_failed"`
}

// selectServicesSQL reads services with their state, their target count and whether a
// delivery to one of its targets failed, in one statement so that the rows are
// consistent. List adds the contract's order, Get a condition on the id.
const selectServicesSQL = `
SELECT services.*, service_states.*,
       (SELECT COUNT(*) FROM targets WHERE targets.service_id = services.id) AS target_count,
       EXISTS (SELECT 1 FROM targets
               WHERE targets.service_id = services.id AND targets.last_delivery_failed) AS alert_delivery_failed
FROM services
JOIN service_states ON service_states.service_id = services.id`

// listServicesOrder is the contract's order: name ignoring case (name_key), then id.
const listServicesOrder = `
ORDER BY services.name_key, services.id`

// List returns every service with its state, ordered by name_key, then id (FR-9). Times
// are in UTC. It never returns nil.
func (r *ServiceRepository) List(ctx context.Context) ([]domain.ServiceView, error) {
	var rows []serviceRow
	if err := r.db.WithContext(ctx).Raw(selectServicesSQL + listServicesOrder).Scan(&rows).Error; err != nil {
		return nil, err
	}
	views := make([]domain.ServiceView, len(rows))
	for i, row := range rows {
		views[i] = row.view()
	}
	return views, nil
}

func (row serviceRow) view() domain.ServiceView {
	row.CreatedAt, row.UpdatedAt = row.CreatedAt.UTC(), row.UpdatedAt.UTC()
	row.LastCheckedAt = utc(row.LastCheckedAt)
	row.LastStatusChangeAt = utc(row.LastStatusChangeAt)
	return domain.ServiceView{
		Service:             row.Service,
		State:               row.ServiceState,
		TargetCount:         row.TargetCount,
		AlertDeliveryFailed: row.AlertDeliveryFailed,
	}
}

// getView reads one service as List does. It returns domain.ErrNotFound when no row
// has that id.
func getView(tx *gorm.DB, id string) (domain.ServiceView, error) {
	var rows []serviceRow
	if err := tx.Raw(selectServicesSQL+` WHERE services.id = ?`, id).Scan(&rows).Error; err != nil {
		return domain.ServiceView{}, err
	}
	if len(rows) == 0 {
		return domain.ServiceView{}, domain.ErrNotFound
	}
	return rows[0].view(), nil
}

// Get returns the service with its state and the two computed values, as List returns
// it, times in UTC. It returns domain.ErrNotFound when no row has that id.
func (r *ServiceRepository) Get(ctx context.Context, id string) (domain.ServiceView, error) {
	return getView(r.db.WithContext(ctx), id)
}

// editableColumns are the columns an edit replaces. It names every one, so that false,
// zero, empty and NULL values are written. It never holds id, created_at, paused or a
// column of service_states.
var editableColumns = []string{
	"name", "name_key", "check_type",
	"http_method", "http_url", "http_query_params", "http_headers", "http_body_type",
	"http_body_content", "json_rules", "json_rule_mode", "cert_check_enabled",
	"cert_min_days_left", "ignore_cert_errors",
	"tcp_host", "tcp_port",
	"check_interval_seconds", "timeout_seconds", "retry_count", "retry_interval_seconds",
	"alerts_enabled", "unhealthy_message", "recovery_message", "shown_on_public_view",
	"updated_at",
}

// Update replaces every editable column of the service with service.ID in one
// transaction, then reads the row back with its state, as Get does, and returns it. A
// duplicate name_key is domain.ErrServiceNameTaken, decided as Create decides it; no
// row with that id is domain.ErrNotFound. Renaming a service to its own name in another
// letter case is not a clash. The id, created_at, paused and the state are untouched
// (FR-7, FR-59, FR-66).
func (r *ServiceRepository) Update(ctx context.Context, service domain.Service) (domain.ServiceView, error) {
	var view domain.ServiceView
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&domain.Service{}).Where("id = ?", service.ID).
			Select(editableColumns).Updates(&service)
		if result.Error != nil {
			if errors.Is(result.Error, gorm.ErrDuplicatedKey) {
				var sameName int64
				if countErr := tx.Model(&domain.Service{}).
					Where("name_key = ? AND id <> ?", service.NameKey, service.ID).Count(&sameName).Error; countErr != nil {
					return countErr
				}
				if sameName > 0 {
					return domain.ErrServiceNameTaken
				}
			}
			return result.Error
		}
		if result.RowsAffected == 0 {
			return domain.ErrNotFound
		}
		var err error
		view, err = getView(tx, service.ID)
		return err
	})
	if err != nil {
		return domain.ServiceView{}, err
	}
	return view, nil
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
