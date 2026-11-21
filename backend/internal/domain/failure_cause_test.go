package domain_test

import (
	"errors"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"

	"monitory/internal/domain"
)

type causeErr struct{ cause string }

func (e causeErr) Error() string        { return "text" }
func (e causeErr) FailureCause() string { return e.cause }

func TestFailureCause(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want string
	}{
		{"nil", nil, ""},
		{"a plain error", errors.New("plain"), ""},
		{"an error with a cause", causeErr{"timed out"}, "timed out"},
		{"a wrapped error with a cause", fmt.Errorf("x: %w", causeErr{"timed out"}), "timed out"},
		{"two causes in a chain: the outer one", fmt.Errorf("x: %w", &outer{causeErr{"inner"}}), "outer"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, domain.FailureCause(tt.err))
		})
	}
}

type outer struct{ inner error }

func (e *outer) Error() string        { return "outer" }
func (e *outer) Unwrap() error        { return e.inner }
func (e *outer) FailureCause() string { return "outer" }
