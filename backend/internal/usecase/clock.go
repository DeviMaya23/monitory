// Package usecase holds the business rules. It defines an interface for everything it
// depends on; the implementing packages satisfy them without importing this one.
package usecase

import "time"

// Clock tells the time. pkg/clock implements it; tests pass a fake.
type Clock interface {
	Now() time.Time
}
