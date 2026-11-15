package migrate

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"sync/atomic"

	"github.com/golang-migrate/migrate/v4/database"
)

// versionTable is golang-migrate's own table. The app does not touch it otherwise.
const versionTable = "schema_migrations"

// driver lets golang-migrate run on the app's own SQLite connection.
//
// golang-migrate ships a SQLite driver, but it registers the database/sql driver name
// "sqlite", which the GORM driver also registers, and a binary cannot hold both. This
// is the small part of that driver the app needs: run a migration file, and keep the
// version and the dirty flag.
type driver struct {
	db     *sql.DB
	locked atomic.Bool
}

var _ database.Driver = (*driver)(nil)

// ctx is the context of every statement: golang-migrate's driver interface carries
// none, and migrations run once at startup, before the app listens.
var ctx = context.Background()

// Open is part of database.Driver. The app always passes its own connection.
func (d *driver) Open(string) (database.Driver, error) {
	return nil, errors.New("migrate: opening by URL is not supported; pass the app's connection")
}

// Close leaves the connection open: the app owns it.
func (d *driver) Close() error { return nil }

// Lock guards against two migration runs in this process. SQLite's own write lock
// guards against another process.
func (d *driver) Lock() error {
	if !d.locked.CompareAndSwap(false, true) {
		return database.ErrLocked
	}
	return nil
}

func (d *driver) Unlock() error {
	if !d.locked.CompareAndSwap(true, false) {
		return database.ErrNotLocked
	}
	return nil
}

// Run executes one migration file in a transaction, so a file that fails halfway
// leaves nothing behind.
func (d *driver) Run(migration io.Reader) error {
	body, err := io.ReadAll(migration)
	if err != nil {
		return err
	}
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return &database.Error{OrigErr: err, Err: "begin transaction"}
	}
	if _, err := tx.ExecContext(ctx, string(body)); err != nil {
		_ = tx.Rollback()
		return &database.Error{OrigErr: err, Err: "migration failed", Query: body}
	}
	if err := tx.Commit(); err != nil {
		return &database.Error{OrigErr: err, Err: "commit transaction"}
	}
	return nil
}

func (d *driver) SetVersion(version int, dirty bool) error {
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return &database.Error{OrigErr: err, Err: "begin transaction"}
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM "+versionTable); err != nil {
		_ = tx.Rollback()
		return &database.Error{OrigErr: err, Err: "clear the version"}
	}
	// A version below zero means no migration is applied: the table stays empty.
	if version >= 0 || dirty {
		if _, err := tx.ExecContext(ctx, "INSERT INTO "+versionTable+" (version, dirty) VALUES (?, ?)", version, dirty); err != nil {
			_ = tx.Rollback()
			return &database.Error{OrigErr: err, Err: "write the version"}
		}
	}
	if err := tx.Commit(); err != nil {
		return &database.Error{OrigErr: err, Err: "commit transaction"}
	}
	return nil
}

func (d *driver) Version() (int, bool, error) {
	var version int
	var dirty bool
	err := d.db.QueryRowContext(ctx, "SELECT version, dirty FROM "+versionTable+" LIMIT 1").Scan(&version, &dirty)
	if errors.Is(err, sql.ErrNoRows) {
		return database.NilVersion, false, nil
	}
	if err != nil {
		return 0, false, &database.Error{OrigErr: err, Err: "read the version"}
	}
	return version, dirty, nil
}

// Drop is part of database.Driver. The app never drops its database.
func (d *driver) Drop() error {
	return errors.New("migrate: dropping the database is not supported")
}

func (d *driver) ensureVersionTable() error {
	_, err := d.db.ExecContext(ctx, "CREATE TABLE IF NOT EXISTS "+versionTable+
		" (version INTEGER NOT NULL, dirty INTEGER NOT NULL)")
	if err != nil {
		return fmt.Errorf("create the migration version table: %w", err)
	}
	return nil
}
