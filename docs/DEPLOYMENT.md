# Google Cloud deployment
No cloud deployment has been verified. These are instructions, not evidence of execution.
Use a dedicated new project; do not deploy over existing services.

## Local / Cloud Shell
Node 22 or later:
```sh
npm install
npm run check
npm test
npm start
```
Open port 8080. Runtime has no third-party dependencies. Playwright is development-only.
Browser checks: `npx playwright install --with-deps chromium && npm run test:browser`.

## Cloud Run staging
After selecting the intended project, billing, region and permissions:
```sh
gcloud run deploy tired-social-staging --source . --region us-west1 --no-allow-unauthenticated --min-instances 0 --max-instances 2
```
Run from a checkout of the verified commit. The project must be explicitly configured before this command.
Source deployment may enable/use Cloud Build and Artifact Registry, with associated charges.
Keep staging authenticated. Use an authorized Cloud Run proxy or account access to verify it.

The Dockerfile binds 0.0.0.0 on PORT (8080 default), runs as non-root, and exposes /healthz.
cloudbuild.yaml is an optional build-only pipeline: create the intended Artifact Registry repository
and pass _IMAGE for the desired revision. It does not deploy or configure IAM.

## Production prerequisites
OAuth/session validation, persistent database, uploads, server authorization, rate limits,
Stripe Connect/test-mode validation, webhook signature/idempotency handling, inventory locking,
refund reconciliation, backup restoration, logs and error monitoring.
Do not accept real payments or treat local demo data as production records.
Pin a revision image for production; verify rollback before domain cutover.
Never put credentials in source. Use service identity and Secret Manager.
