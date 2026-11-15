package usecase_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/usecase"
	"monitory/pkg/clock"
)

func TestSettingsService_SetPublicViewEnabledStampsTheClocksTime(t *testing.T) {
	start := time.Date(2026, 5, 6, 7, 8, 9, 0, time.UTC)
	fakeClock := clock.NewFake(start)
	settings := &fakeSettings{}
	service := usecase.NewSettingsService(settings, fakeClock)

	fakeClock.Advance(90 * time.Second)
	require.NoError(t, service.SetPublicViewEnabled(t.Context(), true))

	assert.True(t, settings.publicViewEnabled)
	assert.Equal(t, start.Add(90*time.Second), settings.updatedAt)

	enabled, err := service.PublicViewEnabled(t.Context())
	require.NoError(t, err)
	assert.True(t, enabled)
}
