package repository

import (
	"context"
	"time"

	"monitory/internal/domain"
)

// publicRow is the three columns the public view shows, and no other.
type publicRow struct {
	Name          string        `gorm:"column:name"`
	Status        domain.Status `gorm:"column:status"`
	LastCheckedAt time.Time     `gorm:"column:last_checked_at"`
}

// selectPublicSQL keeps the services that are shown, not paused, healthy or unhealthy
// and checked at least once (FR-28, FR-113), in the contract's order: name ignoring
// case, then id.
const selectPublicSQL = `
SELECT services.name AS name, service_states.status AS status, service_states.last_checked_at AS last_checked_at
FROM services
JOIN service_states ON service_states.service_id = services.id
WHERE services.shown_on_public_view = 1
  AND services.paused = 0
  AND service_states.status IN ('healthy', 'unhealthy')
  AND service_states.last_checked_at IS NOT NULL
ORDER BY services.name_key, services.id`

// ListPublic returns what the public view shows of each qualifying service, with the
// time in UTC. It never returns nil.
func (r *ServiceRepository) ListPublic(ctx context.Context) ([]domain.PublicService, error) {
	var rows []publicRow
	if err := r.db.WithContext(ctx).Raw(selectPublicSQL).Scan(&rows).Error; err != nil {
		return nil, err
	}
	services := make([]domain.PublicService, len(rows))
	for i, row := range rows {
		services[i] = domain.PublicService{Name: row.Name, Status: row.Status, LastCheckedAt: row.LastCheckedAt.UTC()}
	}
	return services, nil
}
