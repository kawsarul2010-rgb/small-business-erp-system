#!/usr/bin/env bash
#
# Proves business separation against a real PostgreSQL:
#   1. builds a scratch database with migrations 0001-0003 and a single business's data
#      (the shape of an existing one-business install),
#   2. applies 0004, which turns it into business #1 of many,
#   3. adds a second business and checks, as the row-level-security role, that neither can
#      read, change, reference or number the other's data.
#
# Usage:  PGURL=postgres://postgres:postgres@localhost:5432/postgres ./run.sh
# Needs psql and a user allowed to create databases and roles. Uses a database named
# erp_isolation_check, which it drops and recreates.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
migrations="$here/../../src/Sompriti.Erp.Infrastructure/Persistence/Migrations"
PGURL="${PGURL:-postgres://postgres:postgres@localhost:5432/postgres}"
DB=erp_isolation_check
TARGET="${PGURL%/*}/$DB"

psql "$PGURL" -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB"
psql "$TARGET" -q -c "CREATE TABLE IF NOT EXISTS schema_migrations (version varchar(100) PRIMARY KEY, applied_date timestamptz NOT NULL DEFAULT now())"
for f in "$migrations"/000{1,2,3}_*.sql; do psql "$TARGET" -q -v ON_ERROR_STOP=1 -1 -f "$f"; done
# Test-only: default the audit columns so the seed stays short.
psql "$TARGET" -q -v ON_ERROR_STOP=1 -f "$here/audit-defaults.sql" -f "$here/seed-single-business.sql" >/dev/null
psql "$TARGET" -q -v ON_ERROR_STOP=1 -1 -f "$migrations"/0004_*.sql 2>&1 | grep -v NOTICE || true
psql "$TARGET" -q -v ON_ERROR_STOP=1 -f "$here/audit-defaults.sql" >/dev/null
out="$(psql "$TARGET" -q -f "$here/isolation-test.sql" 2>&1)"
echo "$out" | grep -E "PASS|FAIL|ERROR" | sed 's/^psql:[^:]*:[0-9]*: //; s/^NOTICE:  //; s/^ *//'
pass=$(echo "$out" | grep -c PASS || true); bad=$(echo "$out" | grep -cE "FAIL|ERROR" || true)
echo; echo "$pass passed, $bad failed"
[ "$bad" -eq 0 ]
