#!/usr/bin/env bash
set +x
set -euo pipefail
project=tired-social-platform
region=europe-west1
commit=30ca5a682cfc199074d0bb7650d0994e0be7707e
flags=(--project="$project" --region="$region")
[[ $(git rev-parse HEAD:"server/ticket-checkout.mjs") == $(git rev-parse "$commit:server/ticket-checkout.mjs") ]]
registry="$region-docker.pkg.dev/$project/cloud-run-source-deploy/$project/$project"
image=$(gcloud artifacts docker images describe "$registry:$commit" --project="$project" --format='value(image_summary.fully_qualified_digest)' 2>/dev/null || true)
if [[ -z "$image" ]]; then
  src=$(mktemp -d)
  trap 'rm -rf "$src"' EXIT
  git archive "$commit" | tar -x -C "$src"
  gcloud builds submit "$src" --tag="$registry:$commit" --project="$project"
  image=$(gcloud artifacts docker images describe "$registry:$commit" --project="$project" --format='value(image_summary.fully_qualified_digest)')
fi
[[ "$image" =~ @sha256:[a-f0-9]{64}$ ]]
service=$(gcloud run services describe "$project" "${flags[@]}" --format=json)
origin=$(jq -er '.status.url' <<<"$service")
route="https://ticket-test---${origin#https://}"
account=$(jq -er '.spec.template.spec.serviceAccountName' <<<"$service")
signing=tired-stripe-ticket-test-webhook
keyname=tired-stripe-test-key
if ! gcloud secrets describe "$signing" --project="$project" >/dev/null 2>&1; then
  gcloud secrets create "$signing" --project="$project" --replication-policy=automatic
fi
version=$(gcloud secrets versions list "$signing" --project="$project" --filter='state=ENABLED' --limit=1 --format='value(name)')
if [[ -z "$version" ]]; then
  key=$(gcloud secrets versions access latest --secret="$keyname" --project="$project")
  [[ "$key" == sk_test_* ]]
  printf 'Authorization: Bearer %s\n' "$key" | curl -fsS -H @- -H 'Idempotency-Key: tired-ticket-test-hook-v1'     --data-urlencode "url=$route/api/v1/ticket-webhook"     -d 'enabled_events[]=checkout.session.completed' -d 'enabled_events[]=checkout.session.expired' -d 'enabled_events[]=charge.refunded'     https://api.stripe.com/v1/webhook_endpoints | jq -jer 'select(.livemode==false) | .secret | select(startswith("whsec_"))' |
    (secret=$(cat); [[ "$secret" == whsec_* ]]; printf '%s' "$secret" | gcloud secrets versions add "$signing" --project="$project" --data-file=-)
  unset key
fi
for name in "$keyname" "$signing"; do
  gcloud secrets add-iam-policy-binding "$name" --project="$project" --member="serviceAccount:$account" --role=roles/secretmanager.secretAccessor >/dev/null
done
gcloud run jobs update tired-social-migrate "${flags[@]}" --image="$image"
gcloud run jobs execute tired-social-migrate "${flags[@]}" --wait
gcloud run deploy "$project" "${flags[@]}" --image="$image" --tag=ticket-test --no-traffic --remove-env-vars=STRIPE_LIVE_PLATFORM_ACCOUNT --remove-secrets=STRIPE_LIVE_BOOKING_KEY,STRIPE_LIVE_BOOKING_WEBHOOK   --update-secrets="STRIPE_TEST_SECRET_KEY=$keyname:latest,STRIPE_TEST_WEBHOOK_SECRET=$signing:latest"
actual=$(gcloud run services describe "$project" "${flags[@]}" --format='json(status.traffic)' | jq -er '.status.traffic[]|select(.tag=="ticket-test")|.url')
[[ "$route" == "$actual" ]]
curl -fsS "$actual/api/health" | jq -e '.status=="ok"'
code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST -d '{}' "$actual/api/v1/ticket-webhook")
[[ "$code" == 400 ]]
echo "Staging healthy. Unsigned webhook rejected. $actual"
