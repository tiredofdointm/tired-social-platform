# Production backend contract
Status: architecture roadmap. Identity and shared social implementation are described in AUTH.md and SHARED-SOCIAL.md; later commerce/events contracts below remain planned.
Read with PLAN.md. Initial delivery is the account/profile/post interaction journey.

## Ownership and data model
All IDs are server-generated UUIDs. Timestamps are UTC; event timezone is stored separately.
Currency amounts use integer minor units and an explicit ISO currency code.

| Entity | Required relationships and constraints |
|---|---|
| users | unique Google issuer + subject; status active/suspended/deleted; never use email as immutable identity |
| profiles | one per user; unique normalized handle; display name, bio, avatar asset, visibility |
| organizations | owner user; name, slug; business branding |
| memberships | organization + user unique; owner/admin/editor/check-in roles |
| assets | owner user/organization; object key, MIME, size, processing status; no arbitrary trusted URL |
| posts | author user, optional organization/event; body, visibility, moderation state, timestamps |
| follows | follower + followed unique; reject self-follow; respect blocking/private approval |
| blocks | blocker + blocked unique; suppress visibility and interaction in both feed and API |
| reactions | user + post + reaction unique; idempotent PUT/DELETE |
| comments | author + post; body; edited/deleted timestamps; enforce post visibility |
| events | organizer organization, venue, start/end, timezone, visibility, publication and review states |
| rsvps | event + user unique; going/interested; attendance visibility; RSVP is not a paid ticket |
| plans | owner user, optional event, title, meetup details, date; private by default |
| plan_members | plan + user unique; invited/accepted/declined; role owner/member |
| ticket_types | event, currency, price, capacity, sales window; nonnegative counts |
| inventory_holds | ticket type, quantity, purchaser, expiration, status; atomic reservation |
| orders | purchaser, event, currency, subtotal, fees, total, payment reference; immutable price snapshot |
| tickets | order item, opaque random ticket token hash, status issued/checked-in/void |
| providers | user/organization owner, Connect account ID, onboarding and capability status |
| services | provider, category, description, pricing, booking mode, publication/review state |
| availability | provider/service, start/end, timezone; reservations prevent overlapping instant bookings |
| bookings | customer, service, time interval, quote snapshot, status, payment reference |
| webhook_events | provider + external event ID unique; received/processed timestamps and outcome |
| outbox | transactional notifications/jobs with delivery attempts and idempotency key |
| audit_events | actor, action, resource, timestamp, redacted before/after; append-only |
| review_policies | scope/listing type, automatic/manual rule, version and actor |

Business and provider roles add capabilities to an account; they do not grant platform admin rights.
The master administrator is provisioned through trusted configuration, never client signup fields.
Adding another master requires explicit owner approval and an audit event.

## API conventions
Prefix /api/v1. JSON with request IDs. Cursor pagination, bounded page size.
Authenticated mutations require a verified server session and CSRF protection where cookies are used.
Reject unknown privileged fields; derive actor/organization permissions on the server.
Errors: {error:{code,message,requestId,fields?}}. Never return secrets or raw SQL.
Private resources return a consistent not-found response to unauthorized viewers.
Rate-limit auth, uploads, posts, comments, invitations, checkout and check-in.

## First vertical slice
| Method / route | Contract |
|---|---|
| GET /auth/google | Initiate OAuth with state, nonce and PKCE |
| GET /auth/google/callback | Validate provider response, create/rotate session, redirect only to allowlisted paths |
| POST /auth/logout | Revoke current session |
| GET /api/v1/me | Own account, profile and effective capabilities |
| PATCH /api/v1/me/profile | Update only permitted profile fields; validate unique handle |
| POST /api/v1/posts | Create own post after validation and visibility checks |
| GET /api/v1/feed?mode=following/latest/for-you | Filter visibility/block/moderation before ranking; stable pagination |
| PATCH /api/v1/posts/:id | Author or authorized organization editor only |
| DELETE /api/v1/posts/:id | Author/authorized moderator; retain required audit metadata |
| PUT /api/v1/posts/:id/reactions/like | Idempotently like a visible post |
| DELETE /api/v1/posts/:id/reactions/like | Idempotently remove own like |
| POST /api/v1/posts/:id/comments | Comment on a visible, interaction-enabled post |
| PUT /api/v1/follows/:userId | Follow or create pending request according to target privacy |
| DELETE /api/v1/follows/:userId | Remove own follow |

The browser receives a public profile DTO; emails, identities and payout details never appear in feed responses.
Counters are derived or updated transactionally, not accepted from clients.
Browser-local demo state is not automatically uploaded into production accounts.

## Authorization acceptance matrix
- Account A can change its profile; account B cannot.
- A can edit its own post; B cannot change authorId to impersonate A.
- Private plan membership and details are invisible to nonmembers.
- Check-in staff can validate assigned-event tickets but cannot change prices or payout details.
- Provider owners can edit their services; customers cannot accept their own booking on the provider's behalf.
- Organization editors cannot grant themselves owner or master privileges.
- Suspended/deleted accounts lose mutation access; logout invalidates the session.
- Auth callback rejects bad state/nonce, expired responses and unauthorized redirect targets.

## Publishing and moderation
Publication lifecycle: draft -> pending_review -> published -> archived.
Automatic mode transitions valid submissions from draft directly to published.
Manual mode creates a pending review task. Store policy version on submission.
Only authorized reviewers approve/reject; log actor and reason.
Payment onboarding is a distinct state and cannot be bypassed by approval settings.
Service and event review rules use the same policy engine.
Reports/blocks and abuse rate limits remain available in automatic mode.

## Ticket/payment contract
1. Validate event sales window and server-side prices.
2. In a database transaction, reserve inventory with an expiration and idempotency key.
3. Create provider checkout with the server-computed immutable quote.
4. Treat verified webhook processing as payment authority, not a success-page visit.
5. Atomically deduplicate event, transition order and issue ticket records once.
6. Handle delayed success after hold expiry through inventory reconciliation; never silently oversell.
7. Refunds and disputes update payment and ticket states with an audit trail.
8. Check-in atomically changes issued -> checked-in; repeated scans show original check-in details.
Never store payment card data. Fee policy is configured and snapshotted; the demo's 10% is not a production decision.

## Booking contract
Request mode: draft -> requested -> accepted -> payment_pending -> confirmed -> completed.
Also support declined, expired, cancelled and refund_pending/refunded where applicable.
Instant mode requires a transactional availability reservation before payment.
Both parties see the same quote, cancellation policy and status.
Retries must not double-book, double-charge or double-notify.
Notifications are outbox jobs; never report an invitation as sent before provider acceptance.

## Migration and release gate
Use versioned migrations, database constraints and API integration tests.
Test two real test accounts, concurrent inventory/booking races, duplicate webhooks,
expired holds, authorization bypass attempts and rollback/restore.
Only replace demo labeling when the corresponding service is live and tested.
