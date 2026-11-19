BEGIN;
ALTER TABLE sessions ALTER COLUMN token_hash DROP NOT NULL;
CREATE INDEX sessions_credentials_expiry_idx ON sessions(expires_at) WHERE token_hash IS NOT NULL;
COMMIT;
