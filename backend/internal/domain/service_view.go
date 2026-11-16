package domain

// ServiceView is a service with what is shown beside it: its state, how many targets
// are on its alert list and whether a delivery to one of them failed.
type ServiceView struct {
	Service             Service
	State               ServiceState
	TargetCount         int
	AlertDeliveryFailed bool
}
