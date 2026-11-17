BEGIN;
CREATE TABLE oauth_login_attempts (
 state_hash bytea PRIMARY KEY CHECK (octet_length(state_hash)=32),
 browser_hash bytea NOT NULL CHECK (octet_length(browser_hash)=32),
 nonce text NOT NULL,
 code_verifier text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 CHECK (expires_at > created_at)
);
CREATE INDEX oauth_login_attempts_expiry_idx ON oauth_login_attempts(expires_at);
COMMIT;
