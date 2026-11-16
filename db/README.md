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
