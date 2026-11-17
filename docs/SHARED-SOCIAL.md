# Shared community implementation

`#community` is a separate account-backed screen. It uses server APIs and PostgreSQL,
not localStorage. The original feed, events, plans and marketplace remain explicitly
labeled local previews. No sample records are imported into accounts.

Activation uses the database and Google authentication configuration in AUTH.md.
Without that configuration the community screen explains that it is unavailable.
This implementation has local and CI test coverage; live cloud activation remains
blocked on the deployment/access and identity setup gates.

## Included
- Editable own handle, name, bio and follow-approval preference.
- Account lookup by handle. Private bios require an accepted follow; name and handle
  remain discoverable unless either account has blocked the other.
- Persistent posts with public, accepted-followers or only-me visibility.
- Latest and Following feeds with stable cursor pagination (20 default, 50 maximum).
- Owner-only post edits/deletion at the API; UI supports creation/deletion.
- Idempotent likes, persistent comments and the most recent 50 visible comments.
- Public follows, private follow requests, accept/decline, unfollow and block/unblock.
- Sign-out clears the shared view and revokes its server session.

Profile privacy controls bio access and follow approval; it does not automatically
change a post's explicitly selected audience. Accepted followers remain accepted
when privacy changes. Blocking removes both directions of following; unblocking
never restores those relationships automatically.

## HTTP contract
All routes require an active unexpired session, including reads. Mutations require
exact-origin and session-bound CSRF verification. Unknown body fields are rejected;
actor IDs always come from the server session. JSON bodies are capped at 16 KiB.
Responses have no-store caching, a request ID and non-sensitive error messages.

| Route | Methods |
|---|---|
| /api/v1/me/profile | PATCH full allowed profile fields |
| /api/v1/profiles/:handle | GET public/minimal profile |
| /api/v1/feed?mode=latest or following&cursor=...&limit=... | GET |
| /api/v1/posts | POST body and visibility |
| /api/v1/posts/:id | GET, PATCH body/visibility, DELETE |
| /api/v1/posts/:id/comments | GET latest 50, POST body |
| /api/v1/posts/:id/reactions/like | PUT, DELETE |
| /api/v1/follows/:userId | PUT follow/request, DELETE unfollow |
| /api/v1/follows/:requesterId/accept | PUT accept, DELETE decline pending request |
| /api/v1/me/follow-requests | GET first 50 requests |
| /api/v1/blocks | GET first 100 own blocked accounts |
| /api/v1/blocks/:userId | PUT block, DELETE unblock |

Feed filtering applies visibility, two-way blocks, deletion, moderation and account
status before pagination. Inaccessible post/profile IDs return 404. Unique handle
conflicts return 409. Invalid bodies return 400/413/415. A bounded per-instance
write cap is present; distributed rate limits and abuse reporting remain launch work.
Follow/block writes lock each user pair in a consistent order to avoid deadlocks.

## Evidence and limits
Database HTTP checks exercise two sessions, privileged-field rejection, CSRF,
private content, pending/accepted follows, comments, idempotent likes, block/unblock,
owner edits, deletion, suspension and cursor bounds.
With TEST_BROWSER=1, database tests also run two isolated Chromium accounts against
the actual server and disposable PostgreSQL: profile edits, post publication,
comments, follow, private visibility, reload persistence, mobile layout and logout.
Only session bootstrapping bypasses Google in that test. Real provider sign-in remains
an explicit activation gate; these are not production-user tests.

Future work: real Google/cloud activation, notifications, comment management,
ranked discovery, media, distributed abuse controls and shared events/private plans.
