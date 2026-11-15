package handler

import (
	"context"

	"monitory/internal/api"
)

// unimplemented answers every operation with ErrNotImplemented (HTTP 501). Server
// embeds it; a real implementation on Server takes precedence. When an operation is
// implemented its stub stays here: the method on Server shadows it.
type unimplemented struct{}

func (unimplemented) GetPublicDashboard(context.Context, api.GetPublicDashboardRequestObject) (api.GetPublicDashboardResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) TestServiceCheck(context.Context, api.TestServiceCheckRequestObject) (api.TestServiceCheckResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) ListServices(context.Context, api.ListServicesRequestObject) (api.ListServicesResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) CreateService(context.Context, api.CreateServiceRequestObject) (api.CreateServiceResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) DeleteService(context.Context, api.DeleteServiceRequestObject) (api.DeleteServiceResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) GetService(context.Context, api.GetServiceRequestObject) (api.GetServiceResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) UpdateService(context.Context, api.UpdateServiceRequestObject) (api.UpdateServiceResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) PauseService(context.Context, api.PauseServiceRequestObject) (api.PauseServiceResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) ResumeService(context.Context, api.ResumeServiceRequestObject) (api.ResumeServiceResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) TestTarget(context.Context, api.TestTargetRequestObject) (api.TestTargetResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) ListTargets(context.Context, api.ListTargetsRequestObject) (api.ListTargetsResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) CreateTarget(context.Context, api.CreateTargetRequestObject) (api.CreateTargetResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) DeleteTarget(context.Context, api.DeleteTargetRequestObject) (api.DeleteTargetResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) UpdateTarget(context.Context, api.UpdateTargetRequestObject) (api.UpdateTargetResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) SignOut(context.Context, api.SignOutRequestObject) (api.SignOutResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) GetSession(context.Context, api.GetSessionRequestObject) (api.GetSessionResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) SignIn(context.Context, api.SignInRequestObject) (api.SignInResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) GetPublicViewSettings(context.Context, api.GetPublicViewSettingsRequestObject) (api.GetPublicViewSettingsResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) UpdatePublicViewSettings(context.Context, api.UpdatePublicViewSettingsRequestObject) (api.UpdatePublicViewSettingsResponseObject, error) {
	return nil, ErrNotImplemented
}

func (unimplemented) GetHealth(context.Context, api.GetHealthRequestObject) (api.GetHealthResponseObject, error) {
	return nil, ErrNotImplemented
}
