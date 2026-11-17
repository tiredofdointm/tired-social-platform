# Progress and next tasks
The authoritative backlog is [project/progress.json](../project/progress.json).
Do not maintain conflicting task states in this document.

[Progress workflow](https://github.com/tiredofdointm/tired-social-platform/actions/workflows/progress.yml)
publishes a summary and downloadable report after progress/doc changes or manual dispatch.
It validates dependencies, task states, evidence fields, retry gates and a one-task work-in-progress limit.

## Current map
- Complete: independent source/runtime; automated platform checks; local UI milestone;
  master plan/backend contract; PostgreSQL social schema and database tests.
- Complete: dependency-aware progress tracking workflow (verified in GitHub Actions).
- Complete: React/TypeScript migration with preserved browser-local journeys.
- Complete: server data-access layer and migration runner; PostgreSQL 16 CI passed.
- Next: Google identity and secure sessions (A01).
- Ready: rendered UI/accessibility review.
- Blocked: cloud project/deployment access, pending active billing linkage; project ID tired-social-platform is confirmed.
- Not implemented: live identity, shared social APIs, production events/plans,
  ticket sales, provider payouts and launch.

This is milestone tracking, not a claim that a percentage of the full product is done.
Local demo functionality and tested schema are not a deployed multiuser platform.

## Anti-loop rules
1. Read SESSION.md and progress.json before touching code.
2. Follow dependencies; choose the designated next task or document why it changes.
3. One primary implementation task at a time.
4. A failed approach gets a blocker record with a retry condition. No blind retry next session.
5. Switch to a ready independent task when an external prerequisite blocks the primary task.
6. Done requires reviewed evidence and acceptance criteria, not just code or a tool request.
7. Keep deployment IDs, commit SHAs, failures and next actions in SESSION.md.
8. CI publishes recommendations; it does not autonomously execute backlog tasks or verify external evidence links.
