# Tired Social Platform — master plan
Version 1 · 2026-11-16

## Non-negotiables
New independent application, no Laravel. Google Cloud hosting.
Prioritize a polished, interactive, customizable UI alongside useful features.
Do not reuse another application's code or replace tiredevents.com until launch configuration is explicitly resolved.
Never put secrets or private account details in this public repository.

## Workflows
1. Product: translate requests into tasks with dependencies and acceptance criteria.
2. UI: reusable design tokens, responsive components, accessibility, themes and profile branding.
3. Backend/data: accounts, APIs, migrations, permissions, media storage and background work.
4. Commerce: event inventory, ticket sales, provider booking, configurable fees and reconciliation.
5. Verification/release: meaningful automated checks, browser journeys, staging and rollback.
6. Continuity: checkpoint, decisions, blockers, source revision and exact next task.

## Phases and gates
| Phase | Scope | Done means |
|---|---|---|
| 0 | Repository, runtime, CI, staging | Clean build, passing checks, verified staging URL |
| 1 | UI system and customization | Mobile/desktop navigation and preferences work; keyboard controls verified |
| 2 | Accounts/social | Two separate accounts can post, follow, react and comment with persistent shared data and privacy enforcement |
| 3 | Events/friend plans | Organizer publishes, attendee discovers/RSVPs, private group members coordinate |
| 4 | Ticket operations | Test payments issue tickets exactly once; capacity and duplicate check-in checks pass |
| 5 | Talent marketplace | Provider onboarding, availability, booking, fees and test payouts agree across participants |
| 6 | Launch | Critical journeys, recovery, monitoring, moderation and rollback verified |

## Architecture direction
Production proposal: React/TypeScript UI, Node/TypeScript API, Cloud Run,
PostgreSQL on Cloud SQL, Cloud Storage uploads, Google sign-in,
Stripe Connect, queued background tasks and structured logs.
Implemented: strict TypeScript React components bundled with esbuild, served by Node's HTTP server.
The runtime serves built assets and optional Google authentication through server-only database/provider packages. Browser-local preview data
retains the original storage format. Shared-account backend integration remains pending.

## Product rules
- Users can have personal, business and provider capabilities under one account.
- Chronological Following feed remains available alongside transparent personalized ranking.
- Attendance visibility and private group membership require server-side checks.
- Event/service publishing should be automatic after validation by default.
- Admin review policy must be configurable by listing/account type.
- Payment-provider verification is independent of platform listing approval.
- Production instant booking requires authoritative availability; otherwise request-to-book.
- Fee amounts, cancellation policy and total must be clear before payment.
- Production payment webhooks must be verified, idempotent and reconciled.
- Prototype localStorage and sample people must never be represented as live accounts.

## Session protocol
Read SESSION.md and BACKLOG.md, inspect current branch and changes.
Select one primary outcome and highest-priority ready tasks.
Implement, verify, save source and record evidence.
Done requires behavior and evidence; a mockup is not a complete integration.
For blockers, record the exact failure and move to independent useful work.
End with source/deployment revisions, tests, known limitations and exact next action.
No unattended work is implied by this plan.

## Prioritization
Environment blockers > correctness/privacy failures > current phase completion >
UI improvements to current journeys > additional enhancements.
Tasks: Backlog / Ready / In progress / Verification / Done / Blocked.
