# Progress and next tasks
The authoritative backlog is [project/progress.json](../project/progress.json).
Do not maintain conflicting task states in this document.

[Progress workflow](https://github.com/tiredofdointm/tired-social-platform/actions/workflows/progress.yml)
publishes a summary and downloadable report after progress/doc changes or manual dispatch.
It validates dependencies, task states, evidence fields, retry gates and a one-task work-in-progress limit.

## Current status

See [the task ledger](../project/progress.json) for dependencies and task status, and [the launch verification record](SESSION.md#production-launch-verification) for the deployment, recovery and outstanding checks.

## Anti-loop rules
1. Read SESSION.md and progress.json before touching code.
2. Follow dependencies; choose the designated next task or document why it changes.
3. One primary implementation task at a time.
4. A failed approach gets a blocker record with a retry condition. No blind retry next session.
5. Switch to a ready independent task when an external prerequisite blocks the primary task.
6. Done requires reviewed evidence and acceptance criteria, not just code or a tool request.
7. Keep deployment IDs, commit SHAs, failures and next actions in SESSION.md.
8. CI publishes recommendations; it does not autonomously execute backlog tasks or verify external evidence links.
