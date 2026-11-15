// Package memstore holds the in-memory state: sessions, failed sign-in counts, lockouts and rate-limit counters. Nothing in it is written to the database, and it starts empty at every start (FR-114).
package memstore
