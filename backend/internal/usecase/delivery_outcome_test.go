package usecase_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"monitory/internal/domain"
	"monitory/internal/usecase"
)

type flagCall struct {
	serviceID, targetID string
	failed              bool
}

// flagWriterSpy is the one-method DeliveryFlagWriter; it returns err and records calls.
type flagWriterSpy struct {
	err   error
	calls []flagCall
}

func (s *flagWriterSpy) SetDeliveryFailed(_ context.Context, serviceID, targetID string, failed bool) error {
	s.calls = append(s.calls, flagCall{serviceID, targetID, failed})
	return s.err
}

func TestDeliveryOutcome_DeliveredClearsAndFailureSetsTheMark(t *testing.T) {
	for name, tc := range map[string]struct{ delivered, wantFailed bool }{
		"delivered": {true, false},
		"failed":    {false, true},
	} {
		t.Run(name, func(t *testing.T) {
			spy := &flagWriterSpy{}
			svc := usecase.NewDeliveryOutcomeService(spy)

			require.NoError(t, svc.RecordDeliveryOutcome(t.Context(), "s1", "t1", tc.delivered))

			assert.Equal(t, []flagCall{{"s1", "t1", tc.wantFailed}}, spy.calls)
		})
	}
}

func TestDeliveryOutcome_Errors(t *testing.T) {
	t.Run("a deleted target or service is dropped", func(t *testing.T) {
		spy := &flagWriterSpy{err: domain.ErrNotFound}
		svc := usecase.NewDeliveryOutcomeService(spy)
		assert.NoError(t, svc.RecordDeliveryOutcome(t.Context(), "s1", "t1", false))
		assert.NoError(t, svc.RecordDeliveryOutcome(t.Context(), "s1", "t1", true))
		assert.Len(t, spy.calls, 2, "baseline: the write was attempted")
	})
	t.Run("any other error is returned wrapped", func(t *testing.T) {
		boom := errors.New("database is locked")
		svc := usecase.NewDeliveryOutcomeService(&flagWriterSpy{err: boom})
		err := svc.RecordDeliveryOutcome(t.Context(), "s1", "t1", false)
		require.ErrorIs(t, err, boom)
		assert.NotEqual(t, boom, err, "wrapped, not passed through")
	})
}
