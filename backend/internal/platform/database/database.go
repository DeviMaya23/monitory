// Package database opens the SQLite file.
package database

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Open opens the SQLite file at path, creating it and its directory if needed.
//
// Every connection has foreign keys on, the WAL journal and a busy timeout of five
// seconds, and a write transaction takes the write lock when it begins, so a count
// followed by an insert in one transaction cannot be overtaken (docs/data-model.md).
func Open(path string) (*gorm.DB, error) {
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return nil, fmt.Errorf("create the database directory: %w", err)
		}
	}

	query := url.Values{}
	query.Add("_pragma", "foreign_keys(1)")
	query.Add("_pragma", "journal_mode(WAL)")
	query.Add("_pragma", "busy_timeout(5000)")
	query.Set("_txlock", "immediate")
	dsn := "file:" + filepath.ToSlash(path) + "?" + query.Encode()

	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		// Errors are returned to the caller, which decides what to log (CONVENTIONS.md).
		Logger:         logger.Discard,
		TranslateError: true,
	})
	if err != nil {
		return nil, fmt.Errorf("open the database: %w", err)
	}
	return db, nil
}
