BEGIN;
CREATE TABLE provider_connect_accounts (
 provider_id uuid PRIMARY KEY REFERENCES users(id),
 stripe_account_id text UNIQUE NOT NULL CHECK (stripe_account_id ~ '^acct_[A-Za-z0-9]+$')
);
COMMIT;
