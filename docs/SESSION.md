# Session checkpoint
See the [production launch verification](#production-launch-verification) for the latest checks.

Initial checkpoint date: 2026-11-16

## Initial project outcome
Independent source creation, React/TypeScript UI, database foundation and progress workflow are committed.
U03 is complete. The user prioritized Cloudflare connection for tired.events.
Domain audit and cutover configuration are prepared in docs/CLOUDFLARE.md.
D03 is complete and verified. C01 billing/API prerequisites are now verified.
User prioritized deployment; C02 is in verification. GitHub sign-in and repository connection are complete.
A01 remains the next independent application task.
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

## Historical cloud and domain checkpoint (superseded by latest cloud continuation below)
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
Cloud task C01 is complete; C02 awaits GitHub browser sign-in.
C03 domain connection depends on a verified C02 deployment. Do not let this prevent ready development work.

## Continuity rules
Read AGENTS.md, PLAN.md, progress.json and this file.
Use workflow summary for ready tasks. Validate tracker with node scripts/progress.mjs.
No percentage-of-product claims. Done requires reviewed acceptance evidence.
CI reports priorities; it does not autonomously implement backlog work or verify external evidence links.

## Prior continuation
Local git clone and command execution now work; GitHub source remains authoritative.
Billing recheck: https://agent.tinyfish.ai/runs/3fd01e61-b284-4295-add5-6a5bd43ab413
Confirmed no billing linkage and Cloud Run API disabled. The report inferred a closed account
from linkage status, so it does not independently reconfirm account status or IAM privileges.
No cloud/DNS changes made. Prior closed-account evidence remains the last direct selector audit.

## Latest cloud continuation
User reported linked billing and authorized continuing deployment.
Completed console inspection: https://agent.tinyfish.ai/runs/cded7627-0fde-48b2-a4bb-637ea97a8ee4
The inspection reports active linked billing and Cloud Run, Cloud Build, and Artifact Registry enabled.
Do not repeat the closed-billing blocker. Project number was not obtained.
Its claim of no services based on zero cost is not proof; inspect the actual services table.
The unrelated API inventory and hypothetical deployment instructions are not implementation evidence.

Completed deployment attempt: https://agent.tinyfish.ai/runs/d81cb122-4b1e-49a5-a2a3-34a197a0b4bc
Target: tired-social-staging, us-west1, authenticated access, request-based billing, min0/max2.
Source: tiredofdointm/tired-social-platform main, Dockerfile at repository root.
Last verified application source: 288591aa0a4b17a0b45e6b4cd6c450705071eb51;
checkpoint revision: c84485fd94e5de0b268330adcd25f5b91f75454b.
No service URL or deployment success verified yet. No DNS changes.
The run completed at GitHub OAuth login: no GitHub sign-in in the automation profile.
No service was created. User must sign into GitHub and save the browser profile, then
resume Cloud Run repository authorization. This is separate from the working GitHub API connection.
Do not repeat billing checks or Cloud Shell typing. No live OAuth URL/state is persisted here.
Cloud Build configuration now uses npm ci and explicitly enables nested image substitutions.

## GitHub connection continuation
GitHub sign-in now works. Google Cloud Build GitHub App installed with access only to
tiredofdointm/tired-social-platform; source selection and Dockerfile configuration completed.
Evidence: https://agent.tinyfish.ai/runs/ddb44cc2-247a-4a94-8602-650c48509254
That run stopped before submission because Require authentication was not selected.
This is a form-completion task, not a missing permission or a reason to ask the user again.
No build or service was created in that run. Its expected URL is not deployment evidence.
Use 512 MiB memory for the selected second-generation runtime, 1 CPU, min0/max2.
Follow-up run: https://agent.tinyfish.ai/runs/fdb4506d-4a28-4534-bd90-bd864e7fd6bd
Poll the existing follow-up before starting any new deployment.

## Latest deployment evidence — authoritative continuation
Cloud Build GitHub App is installed only for tiredofdointm/tired-social-platform.
Successful build 1f0039a1-3a75-4cc8-870c-d7a71e79c0dc used main commit
0337c558dec14ea05a549b642b455704c7069c23.
Build evidence: https://agent.tinyfish.ai/runs/e9eb5fd0-e904-407d-97f6-3bad16cf5e4c
Trigger name: rmgpgab-tired-social-staging-us-west1-tiredofdointm-tired-soheq.

Service inspection reports healthy/serving for tired-social-staging in us-west1:
https://agent.tinyfish.ai/runs/91c3e8f4-f1fe-4b28-b965-bb62930c22ce
Reported URL: https://tired-social-staging-1081107677856.us-west1.run.app
Trigger ID reported: 46c84a77-dc13-461e-b928-084bf7dfccdc.
Ready revision, traffic, source-image linkage, IAM and deployed scaling were NOT verified.
A separate local HTTP GET to the reported URL's /healthz returned Google's HTTP 404 page.
Do not claim a working endpoint or mark C02 done from the healthy-console summary alone.

The deployment run fdb4506d-4a28-4534-bd90-bd864e7fd6bd ended on a new-service form
with name conflict. Do not follow its suggestion to delete or rename: use the existing service.
Configured form values are NOT proof of deployed settings.
Target remains IAM auth, request-based billing, 1 CPU, 512MiB, min0/max2.
Read-only actual YAML verification run: 92113744-aa8f-4840-833c-ec0f374a9689.
No DNS changes. No live user login/shared database/payment functionality added.

## Verification result and unresolved discrepancy
YAML inspection run 92113744-aa8f-4840-833c-ec0f374a9689 reports:
- ready revision tired-social-staging-00001-wrl, 100% traffic
- image gcr.io/tired-social-platform/tired-social-staging:sha-0337c558dec14ea05a549b642b455704c7069c23
- CPU 1000m, memory512Mi, min0, revision max10, service max2, ingress all
- invoker-iam-disabled=true (would disable IAM checks)
These are browser-agent reports, not independently downloaded YAML.
A follow-up Security inspection (1dd1c110-9013-4f4b-905f-2cbeacce8146) instead reports
Require authentication selected, IAM checked, IAP unchecked, and No changes made.
It could not confirm the YAML annotation or allUsers bindings, and did not run an authenticated
health test. No saved authentication correction is confirmed. Treat enforcement as unresolved.

C02 remains in verification, not done. Next bounded task: inspect authoritative deployed service
configuration/IAM and perform authenticated GET /healthz. Resolve reported URL's 404 before
claiming live endpoint success. Do not create/delete/rename the existing service.
All browser runs listed above are completed; none should be polled as active.
C03 DNS cutover remains pending. A01 login/shared data remains the next independent code task.
This checkpoint-only commit uses [skip ci] to avoid redeploying identical app code.

## Google identity implementation continuation
A01 is now in verification; C02 is blocked. This supersedes earlier next-task/status lines.
Added server Google OAuth flow (state/nonce/PKCE), secure hashed sessions, /me,
logout Origin/CSRF enforcement, active-account checks and migration002. UI account
controls are configuration-driven; sample workspace data remains local and separate.
Docker now installs production dependencies and includes backend/migration files.
See docs/AUTH.md for activation, security contract and test/live distinction.
Local strict type/syntax, 8 unit/HTTP tests and 8 PostgreSQL18.6 tests passed.
Browser/container and PostgreSQL16 CI evidence must be reviewed before completion.

Cloud run305f7104-4b46-478f-b424-43100aeaebe8 completed without an authenticated
GET /healthz. Its missing-app-route diagnosis is unsupported: server.mjs already
has the route and automated HTTP tests pass. Console Test only generated POST root.
No cloud configuration change was saved. Do not repeat that dialog approach.
Cloud diagnosis now needs actual gcloud service JSON/IAM plus authenticated HTTP
through an authenticated execution channel. No successful live endpoint is claimed.
Health now includes the actual K_REVISION when set to support image/revision diagnosis.

Next action: review A01 CI, record exact source/evidence, then wire the first shared
social API journey (S01). Live activation is a separate gate: dedicated cloud DB,
OAuth client/secrets/redirect, verified host/access model, two real Google accounts.
No live Google credentials, database connection, DNS or payment changes were made.

## Verified authentication checkpoint — current
A01 server implementation is complete; live activation is tracked separately as A02.
S01 is the next ready task. C02 and C03 remain blocked. No work is running unattended.
Source: 9765bc8a78dcf5b0941d59c4b8d3d02835961ba9.
Final code/test revision: 223f0bf21d371bb5cbdb9cd22ad0c92635812301.
PostgreSQL16 migration/replay/social/session tests passed:
https://github.com/tiredofdointm/tired-social-platform/actions/runs/44045152994
Type/syntax, 8 unit/HTTP tests, browser journeys including account UI, Docker build
and actual container GET /healthz with revision assertion all passed:
https://github.com/tiredofdointm/tired-social-platform/actions/runs/44045520392
Local PostgreSQL18.6 and Chromium checks also passed.
Initial CI uncovered an ambiguous existing comment locator; scoped it to the exact
post. The new container probe initially raced startup; added bounded error retries.
Both fixes are verified in the final platform run. No application bypass was needed.

GitHub Cloud Build check-run evidence for source9765bc8 reports build/push/deploy
SUCCESS for staging build00ead8e9-dbe8-48e2-803e-2b18eb507bcd.
It also reveals a second existing trigger in this same project:
rmgpgab-tired-social-platform-europe-west1-tiredofdointm-tiraks,
trigger690c113f-a6ad-4ca4-a694-d8e93388ca0e, build796d19e8-abc7-48ca-b64e-3911ffff4dd6.
Both react to repository pushes; their intended ownership/target relationship needs
reconciliation before future cloud changes. Neither was deleted or disabled.
The reported staging URL still returned Google404 after deployment success.
Authenticated live health, deployed enforcement and current revision remain unverified.

Next build action: implement S01 with authenticated server actors, bounded input,
CSRF-protected mutations and two-account privacy/ownership tests. Preserve the
explicit preview until shared API flows are wired and verified. In parallel only
when an authenticated execution channel is available, obtain authoritative Cloud
Run service JSON/IAM and authenticated GET health. Avoid the failed Console Test
dialog route, duplicate services, and DNS cutover while C02 is unresolved.
This documentation-only checkpoint uses [skip ci] to avoid redundant deployments.

Latest checked cloud source223f0bf also passed both Cloud Build checks: staging
d891daf5-5fff-4be6-a5b3-b40215b6d0ca and europe116bd49e-c7ad-4f75-84dc-c38b50fd5d13.

## Shared social implementation continuation (2026-11-17)
S01 implemented and entering CI verification. Added authenticated profile/post/feed,
follow request approval/decline, comments, idempotent likes and block/unblock routes.
The new #community screen calls these APIs and stays separate from local demo data.
All actors derive from sessions; mutations require Origin/CSRF and bounded allowed
fields. Feed and comments apply privacy/block/moderation filters server-side.
Two browser accounts tested with the actual server and disposable PostgreSQL; only
session bootstrapping bypasses Google. Profile/post/comment persistence, follows,
private posts, mobile layout and logout passed locally. OAuth activation remains A02.
Form textarea/select accessible labels were corrected after browser checks exposed
ambiguous labels containing control text. Screenshot capture now starts at page top.
See docs/SHARED-SOCIAL.md for API scope, limits and production prerequisites.
Next action: review platform and database CI for this implementation, then record
S01 evidence and designate E01 shared events/private plans. Cloud C02/A02 remain
blocked; no additional cloud configuration or DNS changes were made in this slice.

## Shared community verified checkpoint — authoritative current state
S01 is complete as an implementation milestone, not a live cloud activation claim.
Source4ea555d4b65a99ccd05ae3b0d16184a54ac17765 is committed and verified.
PostgreSQL16, migrations/replay, SQL constraints, authorization HTTP tests and real
server/database two-browser journeys all passed:
https://github.com/tiredofdointm/tired-social-platform/actions/runs/44048520814
Type/syntax, unit/HTTP, existing browser journeys, Docker build and running-container
health response all passed:
https://github.com/tiredofdointm/tired-social-platform/actions/runs/44048520765
Progress graph passed:
https://github.com/tiredofdointm/tired-social-platform/actions/runs/44048520844
Local equivalent checks passed on PostgreSQL18.6. Reviewed community desktop/mobile
screenshots; new account-backed page fits mobile and separates preview actions.
No credentials or demo records were imported. No DNS/cloud settings changed here.

Exact next action: E01 — add versioned schema and server permissions for shared events,
RSVPs and private friend-plan membership, then wire account-backed UI and verify two
accounts, nonmember isolation and persistence. Preserve existing preview sections
until the corresponding shared journeys are implemented and verified.
C02 authenticated cloud health/routing and A02 real Google/database activation remain
blocked on the documented prerequisites. C03 DNS cutover stays gated. No background
implementation is running after this checkpoint. Use [skip ci] for this docs-only save.

## Shared events and private plans
The Shared events workspace supports publication, upcoming event discovery,
capacity-limited RSVPs and cancellation. Private plans support in-app invitations
by handle, acceptance, decline and leaving. Pending invitees see the title only.
The event start is entered in the browser's local timezone and stored as UTC.
Migration 003 adds the shared tables. Apply it before activating this build with
the cloud database. Live Google login and authenticated staging access remain open.
Next: review platform and database CI, then build configurable publishing and review.

Database and platform CI passed for a8a4638cbd5a6e85f4ae6c9a3e5bc66954c30b63. PostgreSQL and two
browser accounts verified RSVP persistence, single-seat concurrency and plan
access before and after invitation acceptance. Next implement E02 publishing
policy and organizer review controls. Staging still needs authenticated verification.

## Publishing review continuation
Event publication now defaults to automatic and can be switched to manual by
a designated admin. Apply migration 004 before activating the authenticated
runtime. Grant publishing access through trusted database administration by
inserting the intended user's verified internal UUID into publishing_admins.
Service publishing is still preview-only and remains part of E02.
Local type checks, unit tests, preview browser tests, and disposable PostgreSQL
and browser integration passed. Tests cover unauthorized policy changes,
pending RSVP denial, and duplicate review denial.
The unauthenticated staging probe still returned 404. Use the disposable
database suite to verify application behavior locally. Deployment verification
requires comparing the service URL and revision from the authenticated Cloud Run
console, then probing /healthz with an identity that has invocation access.

## Shared provider listings and live account checkpoint
The user confirmed that signing in on tired.events returned to Community and
displayed their Google account name. Production Cloud Run revision
tired-social-platform-00012-7v4 serves Google mode. The migration execution
tired-social-migrate-52lww confirmed schema version 4. A second real Google
account and logout revocation remain unverified. Staging and production Cloud
Build runs for the JSX fix succeeded.

The provider listings branch adds migration 005, signed-in directory and
owner withdrawal, and an independent service publishing policy. Existing
publishing admins can review pending service submissions. Signed-out users
see a sign-in prompt in Google mode, and preview mode retains the demo directory.
Service listings do not process bookings or payments.

Next: review PostgreSQL and browser CI on the provider listings branch. Run
migration 005 with the candidate image before promoting a revision that exposes
the new directory. Keep the existing live revision serving until the candidate
is verified. Follow the separate two-account identity verification when possible.

## Shared workspace navigation review
Provider directory changes are merged in 72f610d and production health
reported tired-social-platform-00014-lh6. The Pages menu replaces the mobile
navigation overflow. It displays the active page, collapses after navigation,
and restores button focus on Escape. Shared pages wrap long titles and
account content. RSVP and plan actions reference the corresponding title.

Next: verify the signed-in Chromium checks at 320px and inspect the Events
screenshot before staging the UI revision. This change has no schema migration.

## Mobile navigation production rollout
PR #2 merged at eca6abbb16e81b886a15218aa7d090c03e9e4777 after platform,
PostgreSQL/browser, and progress CI passed for 8efa768bb7299e7864ab6b122a5ce2741f8804cc.
Staging build f1a154b1-45df-4db0-ac8a-e522c6381bfd built that exact commit.
Cloud Run revision tired-social-platform-00015-wqd uses image digest
sha256:68842ec48b010a13901fc38f4033b260cf91eaac98875fca778feb22571cef92.
The mobile-nav-check tag passed /api/health, Google-mode configuration, homepage,
and navigation asset checks before promotion. It now serves 100% of production
traffic. The production custom domain confirmed the revision, mobile assets,
Google sign-in redirect to the configured callback, and signed-out account denial.
The previous rollback revision is tired-social-platform-00014-lh6. No schema
migration was required. Full OAuth completion was previously user-verified on the
older release, and the second-account production test remains open.

Next: continue U02 by inspecting Discover, Feed, Plans, Studio, and Settings at
narrow and desktop widths. Check keyboard navigation, focus and contrast, and
address findings before changing the U02 status.

## Preview workspace accessibility
Discover moves keyboard focus to the event results and exposes selected filters.
Feed controls expose the active feed mode and like state. Preview dialogs offer
a named close button and restore focus when dismissed. Studio has a labeled
keyboard-scrollable event table with row and column headings. Settings and
Studio drop the unused search field. Narrow layouts wrap long user content,
and accent text in light mode has separate contrast-tested colors.

Reviewed light-mode desktop and 320px screenshots of all five preview pages.
The 320px review prompted smaller text for the Discover hero and Studio's
connection status. Chromium checks cover 320px, 768px, and 1440px, including
long sample content, selected filters, dialog focus, keyboard table scrolling,
and light-mode accent contrast.

Next: confirm CI on the final PR #3 revision, then stage and smoke-test this
UI-only update before promotion. No database migration is required.

## Preview accessibility rollout checkpoint
PR #3 merged at 3e65b488acb6a023fd871fe24b3385f274a30634. The merge tree
matches reviewed head 7f673d227332ea3a6b5ead081575fb0a4a11e92f.
Platform, Chromium, PostgreSQL, and progress CI passed on that head.
Production /api/health still reports tired-social-platform-00015-wqd.
The new staging build and candidate have not been verified. The Cloud Console
was inaccessible from this browser, and the connected automation balance was
insufficient for the deployment. No Google Cloud mutations were made this session.

Next: use the authenticated Cloud Shell to resolve the merged commit's staging
image digest or build the exact merge commit if the image is missing. Deploy a
tagged 0%-traffic candidate to the existing europe-west1 service. Verify its
revision, Google auth configuration and preview assets before shifting traffic.
Verify tired.events after the shift and retain 00015-wqd for rollback.

## Preview accessibility rollout verified
The user completed the Cloud Shell rollout. Public GET /api/health on tired.events
returns status ok and revision tired-social-platform-a11y-3e65b48. The homepage
and new accessibility assets loaded. Google mode returned 200, sign-in redirected
to Google with the tired.events callback, and the signed-out account API returned
401. No database migration was needed. Revision 00015-wqd is the prior release.
U02 is complete for the reviewed accessibility scope.

Next: M01. Extend the existing service directory with provider availability and
booking requests. Verify provider and customer permissions and concurrent booking
conflicts. Use the existing Google identity and publishing implementation.

## Provider booking requests
Migration 006 introduces one-hour availability, unique per provider across
listings and per customer across bookings. Requests hold a slot until the
provider confirms or either participant cancels. Both participants can view
upcoming requests in Find talent. Publishing and booking use authenticated
server identities. Next: verify the database concurrency suite and browser CI,
apply migration 006 with the release job, then stage and verify before promotion.

PR #4 merged at 84b6e686e2a90decc8c99966a7296234da9c2e9c. PostgreSQL concurrent requests, participant permissions, two-browser approval and cancellation, migration replay, and platform CI passed. Next: execute scripts/release-provider-bookings.sh in authenticated Cloud Shell and verify the production result.

## Booking rollout verified
The production domain and tagged endpoint both returned status ok on tired-social-platform-bookings-84b6e68. Google sign-in mode is active. The booking API returned HTTP 401 without a session. Request, confirmation, cancellation and race behavior were tested in CI with two accounts. An authenticated production booking was not exercised during this check. Next: T01 ticket inventory and test-mode checkout.

## Ticket inventory in development
Migration 007 and Shared Events support optional USD test ticket prices and one ten-minute hold per account and event. The HTTP suite covers concurrent requests for the last ticket, retry, cancellation, expiry, and the free RSVP boundary. Next: complete sandbox checkout, signed webhook fulfillment and refund reconciliation before production rollout.

## Sandbox ticket checkout
Migration 008 and the ticket checkout endpoint convert a hold to one pending order. Signed Stripe notifications issue the ticket, release expired sessions, and reconcile partial or full refunds. A full refund restores capacity even when it arrives before the completion notification. The paid order is the ticket record. Checkout is available when both STRIPE_TEST_SECRET_KEY and STRIPE_TEST_WEBHOOK_SECRET are configured. Use Secret Manager for both. Configure the sandbox webhook at /api/v1/ticket-webhook for checkout.session.completed, checkout.session.expired and charge.refunded. Use the same HTTPS origin for sign-in and return from Checkout. Next: verify a real sandbox purchase, refund and expired session on a test deployment before promotion.

## Ticketing rollout verified

Sandbox Checkout purchase and full refund succeeded in the staging journey reported by the user on revision `tired-social-platform-00032-yim`. CI covered duplicate and delayed payment notifications, seat contention, checkout expiry, and refunds. The sandbox webhook also listens for `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`.

Cloud Shell confirmed that `tired-social-platform-00033-raf` serves 100% of traffic and that `https://tired.events/api/health` reports that revision healthy. The candidate used the production Google callback and returned `sandbox_checkout_unavailable` for the ticket webhook before promotion. The public build hides test tickets. Rollback revision: `tired-social-platform-bookings-84b6e68`.

Next: T02. Build event-owner guest lists and single-use check-in in the sandbox, then verify that a refund invalidates a ticket and that simultaneous scans cannot both check it in. Live Stripe setup is pending.

## Organizer check-in in development

Migration 009 records the first successful check-in. Owners can open their sandbox guest list, enter a buyer's ticket code and review check-in counts and net test sales. A full refund removes the ticket from the active guest list and makes its code invalid. Owners and attendees with issued tickets can access these event cards for 24 hours after the event starts.

Next: verify migration replay, owner permissions and the two-browser and simultaneous check-in journeys in CI. Apply migration 009 and exercise check-in on the tagged sandbox revision before advancing T02. Migration 010 separates check-in codes from organizer refund references. Organizers can request the remaining sandbox refund from the guest list. Stripe confirmation updates the order, removes it from the guest list, and restores inventory. Apply migrations 009 and 010 and verify both organizer actions on the tagged sandbox revision.

## Organizer operations rollout verified

PR #7 merged at `1ee3b3d9b0066d5a2c545c6282ebcb2787d268f5`. All three CI workflows passed. Cloud Run migration execution `tired-social-migrate-jvt7j` completed, and the user confirmed the sandbox purchase, single-use check-in, and organizer refund journey on `tired-social-platform-00036-gab`. Net test sales and guest-list reconciliation were verified in CI.

Cloud Shell reported 100% production traffic on `tired-social-platform-00037-nix` and a healthy response from the same revision on `tired.events`. The production candidate passed the Google callback and disabled sandbox webhook checks before promotion. Rollback revision is `tired-social-platform-00033-raf`.

Next: M02, Stripe Connect sandbox onboarding, fee disclosure, and payout reconciliation. Live ticket payments remain disabled.

## Stripe Connect sandbox onboarding

The first slice of M02 adds Stripe-hosted onboarding for providers with a published service listing. Migration 011 stores one sandbox connected-account reference per provider. Set STRIPE_CONNECT_TEST_ENABLED=1 with the existing sandbox secret on the tagged staging revision only. The app requests the transfers capability and reads current transfer and payout readiness from Stripe. Provider identity and banking details stay in Stripe.

The sandbox design assumes one US provider and a USD payment per accepted booking. The proposed marketplace flow charges through the platform and transfers the provider share to their connected account. Next: run onboarding in the sandbox, then implement fee disclosure, booking settlement, and refund and payout reconciliation. Live pricing and platform liability decisions remain open.

## Sandbox booking quotes

Migration 012 adds an optional server-calculated USD quote at provider confirmation. Buyers and providers see the service price, customer-paid platform fee and total. Existing confirmations retain their amounts on retry. Cancellation clears the quote before reusing the slot. Quotes require the existing Connect sandbox flag and STRIPE_BOOKING_TEST_FEE_BPS, an integer from 0 to 10000. No live fee has been selected.

Next: exercise quoted bookings between two signed-in sandbox participants, then add checkout for the exact saved quote and reconcile connected-account proceeds, refunds and payouts.

## Sandbox booking payments

Migration 013 reserves a confirmed booking during checkout and stores the price, fee, and destination used in Stripe. Only the buyer can start Checkout. The provider must have active transfers and payouts. Stripe charges the saved quote and transfers the service-price portion to the connected account. The platform pays Stripe processing costs. Signed checkout, expiry, and refund events update the booking payment status. A full refund releases the cancellation lock.

Next: verify an end-to-end sandbox booking payment with two accounts and inspect the matching connected-account transfer. Initiating refunds with transfer reversal and payout reconciliation are still pending.

## Sandbox booking refunds and transfer verification

The buyer and provider completed the staging booking on revision 00041-jaj. The sandbox payment was $107.50 and a read-only Stripe check verified a linked $100.00 transfer to the assigned connected account. PR #11 adds provider-only refund initiation with Stripe transfer reversal and a read-only comparison of charge, refund, transfer and reversal for that booking. The signed Stripe refund event releases the booking lock.

Next: exercise the refund and check that Stripe returned $107.50 to the buyer and reversed $100.00 from the provider. Reconcile a separate sandbox bank payout after this check.

## Sandbox payout reconciliation

The provider completed the full $107.50 sandbox refund on 00042-cot and Stripe returned a $100.00 transfer reversal. The payout panel now reports the five latest payouts for the signed-in provider's sandbox connected account. It compares the USD amount of an automatic bank payout with the net Stripe entries once Stripe completes reconciliation. It identifies manual, pending, mismatched, and incomplete results.

Next: stage the panel and verify an actual paid automatic sandbox payout. The earlier booking was fully reversed, so a separate sandbox booking or existing eligible balance is needed for the payout check. Do not mark this as bank receipt verification.

## Marketplace build rollout verified

Cloud Shell confirmed 100% production traffic on `tired-social-platform-00044-pov` and a healthy response from that revision on `https://tired.events`. The candidate passed the Google callback and disabled sandbox webhook checks before promotion. Rollback revision: `tired-social-platform-00037-nix`. Sandbox test traffic uses the `ticket-test` tag on `00043-fub`.

M02 remains open for automatic payout reconciliation. Stripe last reported USD 100.00 pending, USD 0.00 available, and no payouts on the connected sandbox account. Payouts are enabled on a daily schedule with a two-day settlement delay. Live payments remain disabled.

## Provider balance and booking payout verification

The sandbox provider panel now shows pending and available USD balances and checks up to 1,000 funding entries per automatic payout. The Cloud Shell diagnostic follows the test booking's destination payment into the provider's payout. It reports a match only after both the booking contribution and the complete payout total agree. The last observed sandbox balance was $100 pending. No paid payout has been verified yet.

Next: stage this reviewed commit and run the sandbox release batch in docs/DEPLOYMENT.md. It includes the Google sign-in recovery checks from PR #15 and the payout diagnostic. If funds are still pending, use the read-only diagnostic for subsequent checks; staging is unnecessary for a balance refresh. Production was last verified on revision 00044-pov.

## Booking payout verification in the provider dashboard

The automatic Cloud Build deployment of PR #16 succeeded on `tired-social-staging-00033-vvh` in us-west1. Its health endpoint requires authorized access. Public health still reported `00044-pov`, and the europe-west1 `ticket-test` tag reported `00043-fub`. The exact us-west1 build is f7ee614c-7947-49ee-8295-cfb8639149ff.

Find talent now lets providers select one of their recent paid bookings under Sandbox payouts, including bookings that have ended. The check traces the saved Stripe payment through the provider transfer and verifies its contribution to a reconciled paid payout. The browser and Cloud Shell diagnostic use the same matching rules.

Next: deploy the merged changes to the europe-west1 payment sandbox with the existing release batch, then verify the real booking in Find talent. Cloud Shell and the Cloud Run console returned Site Unavailable from the connected browser. The booking payout remains in verification.

## System appearance preference

The ticket-test sandbox serves 00046-zab. The deployed booking payout check reports $100 pending and no recorded payout. Production smoke checks passed on 00044-pov. The scheduled payout watch handles the remaining Stripe verification while independent UI work continues.

Customize now offers a System theme that follows the device color scheme and responds to changes while the page is open. Existing Dark and Light settings are preserved. Next: verify the browser appearance and persistence checks in CI and confirm the automatic staging deployment.

## November 18 sandbox payout check

At 23:35 UTC, Stripe showed one matching unrefunded $107.50 sandbox booking charge and its unreversed $100 provider transfer. The provider had $100 pending, $0 available and no payouts. The balance entry for that specific transfer showed $100 net and a funds availability timestamp of November 25, 2026 at 00:00 UTC (November 24 at 4 p.m. Pacific). Stripe had not issued a payout or supplied an arrival date.

After that time, open **Find talent → Sandbox payouts** on the payment staging site, select the original paid booking and refresh its payout check. The command-line diagnostic also accepts the original transfer ID as an argument, which it needs once the transfer falls outside its seven-day search window. Keep M02 in verification until the booking contributes $100 to a paid automatic payout and the funding entries match that payout’s total.

## Production launch verification

On November 18, 2026 Pacific time, the public smoke suite passed all six checks on `tired-social-platform-00057-ciz`. Cloud Run assigned it 100% of production traffic. Google Cloud Build `fc09c79e-f52d-4a3d-8ba5-0d7681997ccb` succeeded for commit `dc955a1a84218dc752885ea09c510f419883a858`. Private staging served that commit on `tired-social-staging-00041-kr8`. Its `/api/health` required authentication (403 signed out, 200 with a Google identity token), and returned the exact revision. The service scales from the default minimum of zero to a service maximum of two.

The apex Cloud Run mapping reported Ready, DomainRoutable and CertificateProvisioned. Its four IPv4 records matched public DNS. HTTPS on the apex returned the production revision, and www redirected to the canonical HTTPS hostname with the path and query intact. Google Workspace MX and the CloudFront auth alias still resolved. No DNS records changed during this check. A direct TLS check of the former origin at `136.110.237.35` reset. Restoring that DNS address is not a verified recovery path.

Cloud Monitoring uptime check `tired-events-production-health-62sKXej3fxM` tests HTTPS, certificate validity, HTTP 200 and a JSON status of `ok` every five minutes. Alert policy `14027476946105770365` opens an incident when two or more check locations fail for five minutes. The project owner's selected email channel is attached. The owner subsequently confirmed receipt of the labeled delivery test described below.

The monitoring API returned passing measurements from Oregon, Belgium, Singapore and São Paulo. A private Cloud Run rehearsal served the previous production image, validated the current image at zero traffic, promoted it, then restored the previous image to 100%. The health response matched the intended revision at each step. The rehearsal service was deleted after verification.

PR #25 made the shared community the homepage on hosts with real accounts. Google Cloud Build `d43f6a30-13c0-456e-8e08-89c2cf6d515f` deployed merge `a1db774b3fe6661451d2cc69e92b75237674c3cd` to private staging. Production candidate `00059-yew` served the account homepage before promotion. Production then passed all six smoke checks and Chromium opened the shared community at 390px and 1440px with no horizontal overflow. Rollback for that release was `00057-ciz`.

The automatic backup from November 18 at 05:16 UTC restored with five migrations. On-demand backup 1795047321664 captured the database at November 19 00:15 UTC (November 18 Pacific time). Restore operation 2979ef82-7f90-4fbe-b133-97f600000024 finished in 12 minutes 39 seconds. Both ledgers and all 14 migration checksums matched the release source. The restored application role read existing users and profiles and passed transactional writes, audience restrictions, blocking and moderation checks. All fixture writes rolled back. This backup met the pre-release recovery target. The temporary database and rollout rehearsal service were removed.

The personalized feed and opt-in attendance changes passed PostgreSQL and browser tests in PRs #26 and #27. On the recovered copy, migration 015 preserved private attendance for existing profiles and a second run applied zero changes. Production migration job tired-social-migrate-wg8dv completed. Cloud Build ab4ffe1e-18ec-4aba-b952-a608e2184485 staged merge bdf84eb21aa2815753b961fd4e382c58c0b596d2 on 00044-tcr. The sandbox passed on 00061-nan. Production revision tired-social-platform-00062-hes passed all six smoke checks at 100% traffic. The public bundle contained the new feed and attendance controls. Production rollback is 00059-yew.

Tired Studios is the selected live merchant. The customer-paid fee for live talent bookings is 7.5% of the provider service amount, rounded to the nearest cent before checkout. A $100 service has a $7.50 platform fee and a $107.50 buyer total. The Google Cloud secret for the server credential has been provisioned. Live collections require mode-isolated records, the merchant credential, a signed live webhook and verification. Production checkout remains disabled at this checkpoint.

The recovered database contained at least two distinct Google accounts with sessions and at least one revoked session. Production hostname logs for November 16 through this check contained one successful Google callback and no logout. The sandbox and production share the database, so the aggregate alone cannot verify the two-account production journey.

PR #29 deployed the booking payment integration with real payments disabled. Cloud Build 98e11226-f1ef-45df-b5c9-661b537d4c86 staged f0342773e874c7936b4d69aa20d50cb905e6752f on tired-social-staging-00046-hhq. Backup 1795049322074 succeeded before migration 016. Migration job tired-social-migrate-wpflq completed. The test checkout passed its health, redirect and signature checks on 00064-tib. Production 00065-vam passed all six public checks and returned live_bookings_unavailable at the new webhook. Rollback is 00062-hes.

The owner also selected Tired Studios and a 7.5% customer-paid fee for paid event tickets. While the test payout and merchant credential are pending, the ticket integration adds organizer onboarding, separate live event inventory, a fee breakdown, ticket issuance and refunds. Next, verify the release on staging and production with payment collection off. Activate it after the merchant credential and endpoint signing secret are in place and the outstanding payment checks are verified.

Cloud Build 77dfd245-189b-4b93-b1e5-e833463f5a1f staged PR #30 on tired-social-staging-00047-j7g. Backup 1795051316596 completed and production migration tired-social-migrate-t2v9g applied the event ticket schema. The test uses two independently signed-in fixture accounts, a real PostgreSQL database and simulated Stripe responses. It checks the $100 organizer amount, $7.50 buyer fee, $107.50 total, guest list, refund, duplicate payment notification and inventory separation.

Signed-in members can use Create on the shared community, events and talent pages to start a post, event, private friend plan or service listing. The mobile browser check opens all four forms, checks keyboard focus and the selected event or plan type, and verifies that the pages fit a 390-pixel viewport.

On November 18 Pacific time, build f433d86f-c6c3-410d-af21-c8ffe6803b5b deployed merge 7e19edfffa29e7561f66cbfb557a944e0112ecf9 to private staging 00048-zqd. Its signed-in health check matched the build and revision. Test payments passed the health, redirect and signature checks on 00067-wib. Production revision 00068-hif took 100% of traffic and passed all six smoke checks. Chromium verified the public community, events and talent pages at 390px and 1440px. The live booking webhook returned 503 with collections disabled. Keep 00065-vam as the application rollback for this release.

The authorized alert delivery drill opened Cloud Monitoring incident 0.of6rjo7y41s0 on the same email channel as the production policy. The single-purpose test policy was removed, and the production outage policy remained enabled. The account holder confirmed receipt of the labeled Google Cloud email in the intended inbox.

The event operations change lets the organizer assign check-in staff by account handle and remove access. A staff member can check a ticket for the assigned event. Revenue, guest lists, refunds and staffing controls remain with the organizer. The database records grant changes and who checked each ticket.

### Current deployed state

Build 137b177d-fb21-4f04-8017-b6c365cc1ddc staged merge 316cdd37416e14308fc84be173f63ee505cfcc97 on tired-social-staging-00049-ndq. The authenticated health response and immutable image digest matched the revision. Cloud SQL backup 1795052319533 succeeded before migration 018. Job tired-social-migrate-4mkfz completed. The ticket-test revision 00070-yug passed its health, Google redirect and webhook signature checks with zero public traffic. Production 00071-gez then took 100% of traffic. All six public checks passed. Chromium opened the real community, event and talent pages at 390px and 1440px. The live webhook reported payments disabled.

The owner selected recovery to the working Tired.Events DNS configuration and the previous application version. A private DNS rehearsal returned NXDOMAIN for the missing apex. Restoring the saved configuration restored all four A and four AAAA answers, matching the Google domain mapping and public DNS. HTTPS with the production hostname returned the expected revision through each of the eight addresses. Both observed www edge addresses returned a 301 preserving the supplied path and query. Public DNS stayed in service throughout.

A private Cloud Run rehearsal used the exact application images for 00068-hif and 00071-gez. It served the previous app, verified the candidate at zero traffic, promoted it and restored the previous app to 100%. At every step the revision, image digest, health response and client bundle matched the intended release. The rehearsal service was private and was deleted after verification. The production rollback target is 00068-hif.

Next, verify both production Google sign-ins and logout with the two designated accounts. The project owner confirmed the second account is signed into TinyFish. Its wallet had insufficient credit for a browser run. Live checkout also requires a version of the Tired Studios credential in Secret Manager, the matching endpoint signing secret and seller onboarding. Check the original $100 test transfer after November 24 at 4 p.m. Pacific for a paid automatic payout. Production collection stays disabled until the outstanding commerce checks pass.

The existing production and test revisions used the same runtime identity before live credential activation. The project now has a separate production service account and an empty signing-secret slot. During release, check the identity of each tagged revision and the Cloud Secret Manager policies before enabling the selected merchant.
