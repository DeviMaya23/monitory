package worker

import "monitory/internal/domain"

// NoopScheduler satisfies usecase.Scheduler and does nothing, so a new service stays
// not_yet_checked. The scheduler task replaces it and deletes this file.
type NoopScheduler struct{}

// Start does nothing.
func (NoopScheduler) Start(domain.Service) {}

// Stop does nothing.
func (NoopScheduler) Stop(string) {}
