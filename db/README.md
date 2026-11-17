# Database foundation
PostgreSQL 16 identity/social schema. Not yet connected to the application or applied to Google Cloud.

Apply 001_identity_social.sql once against a new database using a migration runner and
psql -v ON_ERROR_STOP=1. It is transactional and records schema version 1.
Future migrations must be additive/versioned; do not repeatedly run this initial file.

Tests use an ephemeral PostgreSQL service in GitHub Actions and roll back their fixtures.
The literal CI password is disposable test configuration, not a production credential.

The can_view_post predicate handles visibility, accepted follows, two-way blocks, suspension,
moderation and deletion. API code MUST call it with the authenticated server-side user ID.
It does not authorize mutations, validate sessions, or grant direct database access.
Do not expose database credentials to browsers. Runtime DB roles should have minimum permissions;
migrations use a separate owner role. RLS is not implemented in this foundation.

Token hashes must be SHA-256 digests of cryptographically random session tokens.
Never store raw session tokens. Expiration and revocation must be checked on each request.
Only core personal/social entities are included; organizations, tickets and bookings follow
docs/BACKEND-CONTRACT.md in subsequent migrations.

Before production: implement endpoint authorization, transactional writes, connection handling,
migration orchestration, backups/restoration, and authenticated two-user integration tests.

## Server access and migration runner (D03)
Install with `npm ci`. Set `DATABASE_URL` only in the server/release environment and
run `npm run db:migrate` using the migration owner role. It never runs on HTTP startup.
The runtime preview still does not connect to this database or import localStorage.

The runner takes a PostgreSQL advisory lock, verifies consecutive migration files and
SHA-256 checksums, and commits each migration and its history together. Re-running an
unchanged release is a no-op. Changed/deleted/unknown versions fail closed. The existing
001 file is unchanged; its outer BEGIN/COMMIT is managed by the runner. New SQL files
must use consecutive three-digit names and an outer BEGIN/COMMIT, with no internal
transaction control; reviewed migration SQL is trusted release code, never user input.
The runner records future versions in schema_migrations and app_migration_history.

An already manually initialized schema without runner history is rejected. Inspect and
explicitly baseline it in a separate reviewed change; do not guess checksums or rerun 001.
No deployed production database is known to need this conversion.

`server/database.mjs` provides a bounded connection pool and same-client transactions.
`server/social-repository.mjs` provides parameterized create/read/list/edit operations,
using can_view_post for reads and active author checks for writes. Feed cursors retain
PostgreSQL timestamp precision. Actor IDs must come from a verified server session;
these functions are internal and deliberately have no unauthenticated HTTP endpoints.
Use a trusted TLS connection configuration for remote databases; TLS verification is
not disabled by application code. Keep migration credentials separate from runtime roles.

Run `TEST_DATABASE_URL=... npm run test:database` only against an EMPTY disposable
PostgreSQL database. The suite refuses an initialized users table. It checks concurrent
migration jobs, replay, drift, rollback, parameter binding, ownership, privacy, blocks,
suspension and cursor paging. The existing SQL constraint suite runs afterward in CI.
Fixtures are test-only and never loaded by the migration command.

Driver references: https://node-postgres.com/features/queries and
https://node-postgres.com/features/transactions.
