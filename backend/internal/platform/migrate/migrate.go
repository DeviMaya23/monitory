// Package migrate applies the embedded migrations to the SQLite file at startup.
package migrate

import (
	"database/sql"
	"errors"
	"fmt"
	"io/fs"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

// Up applies every migration in files that the database does not have yet.
// It does nothing when the database is current.
func Up(db *sql.DB, files fs.FS) error {
	m, err := newMigrate(db, files)
	if err != nil {
		return err
	}
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("apply migrations: %w", err)
	}
	return nil
}

// Down reverses every applied migration, leaving an empty database. Tests use it to
// prove each down file reverses its up file.
func Down(db *sql.DB, files fs.FS) error {
	m, err := newMigrate(db, files)
	if err != nil {
		return err
	}
	if err := m.Down(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("reverse migrations: %w", err)
	}
	return nil
}

// Version returns the number of the last applied migration, or 0 when none is.
func Version(db *sql.DB) (int, error) {
	d := &driver{db: db}
	if err := d.ensureVersionTable(); err != nil {
		return 0, err
	}
	version, _, err := d.Version()
	if err != nil {
		return 0, err
	}
	if version < 0 {
		return 0, nil
	}
	return version, nil
}

func newMigrate(db *sql.DB, files fs.FS) (*migrate.Migrate, error) {
	source, err := iofs.New(files, ".")
	if err != nil {
		return nil, fmt.Errorf("read migrations: %w", err)
	}
	d := &driver{db: db}
	if err := d.ensureVersionTable(); err != nil {
		return nil, err
	}
	m, err := migrate.NewWithInstance("iofs", source, "sqlite", d)
	if err != nil {
		return nil, fmt.Errorf("prepare migrations: %w", err)
	}
	return m, nil
}
