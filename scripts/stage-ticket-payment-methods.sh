#!/usr/bin/env bash
set +x
set -euo pipefail

project=tired-social-platform
region=europe-west1
origin=https://ticket-test---tired-social-platform-y3dmxghtqa-ew.a.run.app
commit=603046b5372adab7959d3b987e2209176e3dd344
registry="$region-docker.pkg.dev/$project/cloud-run-source-deploy/$project/$project"
src=$(mktemp -d)
trap 'rm -rf "$src"' EXIT

key=$(gcloud secrets versions access latest --secret=tired-stripe-test-key --project="$project")
[[ "$key" == sk_test_* ]]
stripe() {
  printf 'Authorization: Bearer %s\n' "$key" | curl -fsS --max-time 20 -H @- "$@"
}
endpoint=$(stripe 'https://api.stripe.com/v1/webhook_endpoints?limit=100' |
  jq -ce --arg url "$origin/api/v1/ticket-webhook"     '[.data[] | select(.url==$url and .livemode==false and .status=="enabled")] | if length==1 then .[0] | {id,enabled_events} else error("Expected one enabled sandbox staging webhook") end')
id=$(jq -er '.id | select(test("^we_[A-Za-z0-9]+$"))' <<<"$endpoint")
mapfile -t events < <(jq -r '
  (.enabled_events + ["checkout.session.completed","checkout.session.expired","charge.refunded",
  "checkout.session.async_payment_succeeded","checkout.session.async_payment_failed"]) | unique[]' <<<"$endpoint")
args=()
for event in "${events[@]}"; do args+=(--data-urlencode "enabled_events[]=$event"); done

image=$(gcloud artifacts docker images describe "$registry:$commit" --project="$project" --format='value(image_summary.fully_qualified_digest)' 2>/dev/null || true)
if [[ -z "$image" ]]; then
  git archive "$commit" | tar -x -C "$src"
  gcloud builds submit "$src" --project="$project" --tag="$registry:$commit" --quiet
  image=$(gcloud artifacts docker images describe "$registry:$commit" --project="$project" --format='value(image_summary.fully_qualified_digest)')
fi
[[ "$image" =~ @sha256:[a-f0-9]{64}$ ]]

stripe "${args[@]}" "https://api.stripe.com/v1/webhook_endpoints/$id" |
  jq -e '.livemode==false and (.enabled_events | index("checkout.session.async_payment_failed")!=null and index("checkout.session.async_payment_succeeded")!=null)' >/dev/null
unset key

gcloud run deploy "$project" --project="$project" --region="$region" --image="$image"   --update-env-vars="PUBLIC_ORIGIN=$origin" --tag=ticket-test --no-traffic --remove-env-vars=STRIPE_LIVE_PLATFORM_ACCOUNT --remove-secrets=STRIPE_LIVE_BOOKING_KEY,STRIPE_LIVE_BOOKING_WEBHOOK --quiet
curl -fsS "$origin/api/health" | jq -e 'select(.status=="ok")'
