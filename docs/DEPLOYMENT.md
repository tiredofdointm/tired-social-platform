# Google Cloud deployment

Tired Events runs in project `tired-social-platform`, region `europe-west1`. The Cloud Run service of the same name serves `https://tired.events`. See [SESSION.md](SESSION.md) for verified rollout checkpoints and the previous production revision.

| Route | Purpose | Configuration |
| --- | --- | --- |
| `tired.events` | Public application | Production Google callback. Sandbox payments disabled. |
| `public-check` revision tag | Verify a candidate before switching production traffic | Production origin and callback. Sandbox payments disabled. |
| `ticket-test` revision tag | Signed-in sandbox payment testing | Tag-specific Google callback and sandbox Stripe secrets. |

The Cloud Run service uses public ingress for the homepage and sign-in. Application sessions protect user data. Tagged revisions currently share the same PostgreSQL database, so use backward-compatible migrations and keep sandbox transactions disabled in the public configuration.

## Build and verify

Use Node 22 or later. Run `npm ci`, `npm run check`, and `npm test`. The test command builds the client into `dist/`. For browser checks run `npx playwright install --with-deps chromium` and `npm run test:browser`. The Docker image binds to `PORT` as a non-root user.

Build the exact reviewed commit and deploy its immutable Artifact Registry digest. The optional `cloudbuild.yaml` builds and pushes an image without deploying Cloud Run. Apply pending migrations using `tired-social-migrate` and wait for it to succeed before routing a candidate.

## Release and rollback

1. Capture the current production revision. Deploy the candidate under `public-check` at zero production traffic with `PUBLIC_ORIGIN=https://tired.events`. Disable the Stripe sandbox flags and remove sandbox secret references from the candidate.
2. Check the tagged candidate's `/api/health`, Google OAuth redirect configuration, and disabled sandbox webhook. Compare the revision and image digest with the intended build.
3. Assign production traffic to the explicit candidate revision. Run the **Production smoke checks** GitHub Actions workflow with the candidate revision, or run `EXPECTED_CLOUD_RUN_REVISION=tired-social-platform-REVISION node scripts/check-production.mjs` from an external network.
4. If public checks fail after routing settles, restore traffic to the captured previous revision and run the same smoke checks against it. Record the deployed or restored revision and any unresolved test in [SESSION.md](SESSION.md).

Use `/api/health` for Cloud Run HTTP checks. The public smoke workflow checks the health response, homepage protections, bundle, Google sign-in configuration, signed-out shared API access, and disabled sandbox webhook. Authenticated business journeys, backup restoration, and bank payout reconciliation require separate verification. Use Secret Manager and the Cloud Run service identity for credentials.

## Database recovery verification

The database CI job uses PostgreSQL 16 to dump the populated integration database and restore it into a separate disposable database. It compares fingerprints of every public table, reruns the data and visibility checks, and validates the migration ledger against the restored copy. CI disposes of the temporary dump when the job exits.

For a Cloud SQL recovery drill, record the backup or point-in-time recovery target and restore into an isolated instance. Keep public Cloud Run traffic and the production connection string in place during verification. On the isolated copy, confirm the migration ledger, application reads and writes, and recovery time. Record the backup timestamp and whether the restored data meets the recovery target before considering any cutover. The CI logical restore and the managed Cloud SQL recovery drill have separate acceptance criteria.

## Sandbox release batch

From a clean checkout pinned to the reviewed commit, run `bash scripts/verify-sandbox-release.sh` in the authenticated project shell with Node 22 or later. It stages that commit, applies migrations and verifies the tagged revision, Google redirect, retry page and sandbox webhook. It then inspects the provider's test balance and the latest five payouts. This command assigns zero production traffic.

The diagnostic selects the single unrefunded $107.50 test booking with a $100 provider transfer from the past seven days. To select an older or ambiguous transfer, supply its Stripe transfer ID as the script's argument. To refresh only the payout report, run `bash scripts/inspect-sandbox-payout-readiness.sh`. A booking match requires its destination payment in a paid automatic payout and agreement between that payout's amount and its funding entries. A pending balance alone leaves the booking unverified.
