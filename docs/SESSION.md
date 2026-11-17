# Session checkpoint
Date: 2026-11-16

## Current outcome
Independent source creation, React/TypeScript UI, database foundation and progress workflow are committed.
U03 is complete. The user prioritized Cloudflare connection for tired.events.
Domain audit and cutover configuration are prepared in docs/CLOUDFLARE.md.
D03 is complete and verified. A01 is the next implementation task while cloud billing blocks deployment.
Authoritative task states: project/progress.json. Do not infer product completion from prototype milestones.

## Reviewed evidence
- Initial platform: 65daada588a13851313554f77428913b07bce149.
- Supported CI runner fix: 82f12684f32485cf8166478869b6b6f6a59eaf2c.
- Database foundation: d57618655c6f80075090b9c995a87a513281e34f.
- Platform verification: https://github.com/tiredofdointm/tired-social-platform/actions/runs/43973459238
  Syntax, 6 unit/HTTP tests, Chromium journeys and Docker build all passed.
- Database verification: https://github.com/tiredofdointm/tired-social-platform/actions/runs/43973458950
  PostgreSQL 16 migration and data/visibility constraints passed.
- Progress workflow: https://github.com/tiredofdointm/tired-social-platform/actions/runs/43975153871
  Dependency validation and next-task report passed.

- React migration: 6a805432a5b7855249e2a5ad0c827316d4c4d9d7.
- Expanded migration verification: https://github.com/tiredofdointm/tired-social-platform/actions/runs/43980895404
  Code/test revision: ca4c3ad3e2577b004a0f69508a9ac1479f34a77a.
  Strict TypeScript, 6 unit/HTTP tests, Chromium journeys and multi-stage Docker build passed.
  Browser coverage includes old-format storage, post/comment/plan persistence, service listing,
  search preserving an unsent draft, Escape dialogs, theme, review/approval, RSVP, booking and mobile overflow.
  Expanded test first used textbox for a search input; corrected to native searchbox role.
  No application workaround was needed for that test-selector failure.

## Implemented versus live
UI: reusable React components with typed state/forms/dialogs and esbuild production assets.
The original browser storage key and CSS are preserved. npm install and npm run build are required
before npm start; npm test runs the build automatically.
UI journeys: responsive local posts, likes/comments/follows, feeds, events/RSVP/review,
friend-plan drafts, talent listings/booking estimates, appearance/profile controls.
Database: versioned identity/social schema, session token-hash constraints,
post visibility predicate, accepted follow checks, two-way blocks, moderation/deletion filters.
Database is NOT connected to the app or deployed in Google Cloud.
No live OAuth, shared data, invitations, tickets, payments or payouts.
No deployed Cloud Run URL verified. Rendered screenshots still need visual/accessibility review.

## Cloud and domain checkpoint
User selected tired.events. Cloudflare saved sign-in works.
Audit: https://agent.tinyfish.ai/runs/94f41e4b-e585-4913-a0b7-afefd58431e4
Apex/www currently use A 136.110.237.35, DNS-only, TTL 300.
Full (strict) and active edge certificates observed. Email/auth/API dependencies exist.
No domain settings or DNS records changed. Do not overwrite existing API/Worker routing.

Project creation is now reconciled: Tired Social Platform, ID tired-social-platform, exists.
Settings/IAM audit: https://agent.tinyfish.ai/runs/5e7c0256-b6f7-4286-a0e9-270573b61289
The signed-in user has Owner (Legacy). The project has no linked billing account.
An earlier generic Cloud Run permission warning was not reproduced on API details.
Attempting to enable run.googleapis.com returned Billing required; API remains disabled.
Attempt: https://agent.tinyfish.ai/runs/940e2811-f88d-4e52-9aa6-7a4c23ce7ece
No deployable service URL is verified. Disabled API pages alone do not prove absence of every service.
Existing unrelated projects are untouched. Never create a duplicate project.
Billing selector result: only My Billing Account was shown; it is closed. Costs-view permission warning observed.
No billing linkage submitted. Billing administrator must reopen it or provide an active account.
Billing choices inspection: https://agent.tinyfish.ai/runs/3d46e89e-454a-4037-9475-c2c5b75730f1

Working source route: GitHub API and Actions. Failed terminal/editor typing routes remain retired.
Next cloud action: resolve billing linkage, enable required APIs, deploy tested revision,
then verify origin/certificates/access before executing docs/CLOUDFLARE.md cutover.

## Next designated task
A01 — implement Google identity and secure sessions.
Use server-only actor identities when wiring repository methods to future routes.
Implement state/nonce/PKCE validation, server sessions stored as token hashes, expiration,
logout revocation, CSRF protection and two-account authorization tests. Keep local preview
explicit and do not import demo data. Live Google login needs configured OAuth credentials
and an approved redirect URL; do not claim it works from mocked provider tests alone.

D03 source revision: 288591aa0a4b17a0b45e6b4cd6c450705071eb51.
Reviewed CI: PostgreSQL 16 migrations, replay and data access/SQL constraint checks passed:
https://github.com/tiredofdointm/tired-social-platform/actions/runs/44000350589
Strict TypeScript, unit/HTTP, browser journeys and Docker build passed:
https://github.com/tiredofdointm/tired-social-platform/actions/runs/44000350603
Progress graph passed: https://github.com/tiredofdointm/tired-social-platform/actions/runs/44000350886
Local checks also passed using PostgreSQL 18.6 (7 Node database tests plus original SQL suite).
Migration 001 is byte-for-byte preserved; no demo import, HTTP API, or live DB connection added.
The backend repository and migration runner are internal modules; the public app remains a local preview.
U02 visual/accessibility inspection remains ready; screenshots exist but are not visually reviewed.
Cloud task C01 remains blocked on billing linkage; project reconciliation is complete.
C03 domain connection depends on a verified C02 deployment. Do not let this prevent ready development work.

## Continuity rules
Read AGENTS.md, PLAN.md, progress.json and this file.
Use workflow summary for ready tasks. Validate tracker with node scripts/progress.mjs.
No percentage-of-product claims. Done requires reviewed acceptance evidence.
CI reports priorities; it does not autonomously implement backlog work or verify external evidence links.

## Latest continuation
Local git clone and command execution now work; GitHub source remains authoritative.
Billing recheck: https://agent.tinyfish.ai/runs/3fd01e61-b284-4295-add5-6a5bd43ab413
Confirmed no billing linkage and Cloud Run API disabled. The report inferred a closed account
from linkage status, so it does not independently reconfirm account status or IAM privileges.
No cloud/DNS changes made. Prior closed-account evidence remains the last direct selector audit.
