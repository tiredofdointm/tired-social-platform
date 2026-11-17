# Google identity and sessions

The server implementation is available behind `AUTH_MODE=google`. The default is
`preview`: no database is contacted and sample social activity stays in the browser.
The shared community screen uses the authenticated social API; the original demo feed remains separate. See SHARED-SOCIAL.md.

## Activation
1. Provision the dedicated PostgreSQL database and restrict connectivity to the service.
2. Supply DATABASE_URL securely to the migration job and run `npm run db:migrate`.
   This applies immutable migrations 001 and 002. Never run database tests on this database.
3. Create a Google Web OAuth client. Register exactly
   `https://<verified-host>/auth/google/callback` as an authorized redirect URI.
4. Supply AUTH_MODE=google, PUBLIC_ORIGIN=https://<verified-host>, GOOGLE_CLIENT_ID,
   GOOGLE_CLIENT_SECRET and DATABASE_URL to Cloud Run. Use Secret Manager references
   for secrets; never place credentials in source, browser assets or build arguments.
5. Verify actual Google sign-in with two allowed test accounts, reload, logout and
   revoked-session access on the HTTPS host before calling the integration live.
   An IAM-protected Cloud Run origin additionally requires cloud access; application
   login does not bypass Cloud Run IAM. Choose and verify the public frontend access
   model before launching ordinary user login.

The server fails startup for incomplete Google-mode configuration. It does not run
schema migrations automatically. `.env.example` is documentation; Node does not
load it implicitly. Health is liveness, not a database or OAuth readiness assertion.
Cloud Run health JSON includes K_REVISION when the runtime supplies it.

## Security contract
- Authorization-code flow uses state, nonce and PKCE S256. Attempts expire in ten
  minutes and are atomically consumed, bound to a Secure browser cookie.
- Google Auth Library verifies the ID token signature, issuer, audience and time
  claims. The application additionally verifies nonce, authorized party, verified
  email and a nonempty subject. The immutable issuer/subject identifies an account.
- No Google access/refresh/ID token is stored. Names are copied only on initial
  profile creation. Google identity grants no admin/master privileges.
- Session cookies use __Host-, Secure, HttpOnly, SameSite=Lax, Path=/, and seven-day
  expiry. Only SHA-256 token hashes enter the database. Login rotates the existing
  browser session. Expired, revoked, suspended and deleted accounts cannot access /me.
- Logout requires POST, the configured exact Origin and a session-bound CSRF token.
  Every future state-changing API must reuse equivalent authorization/CSRF checks;
  the shared social HTTP handler applies these checks to its mutation routes.
- Auth responses are not cached. Errors do not reveal provider tokens or database
  details. Per-instance login caps are only a baseline: configure production edge
  rate limiting and expired-session maintenance before launch.

## Verification and remaining gates
`npm test` verifies configuration and genuinely signed local JWTs using Google's
verification library, including wrong signature, audience, issuer, nonce and expiry.
`npm run test:database` requires an empty disposable TEST_DATABASE_URL. It covers
migration replay/rollback, two account sessions, callback binding/replay/races,
rotation, CSRF, expiry, suspension and logout. Its provider exchange is mocked.
`npm run test:browser` covers account UI states using mocked HTTP alongside the
existing real browser preview journeys. These are not live Google OAuth evidence.

Live database provisioning, OAuth client configuration, real provider sign-in,
Google Cloud health verification and live shared-community activation remain pending.
