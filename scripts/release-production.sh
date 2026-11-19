#!/usr/bin/env bash
set -euo pipefail

service=tired-social-platform
region=europe-west1
production_runtime="tired-social-payments-runtime@$service.iam.gserviceaccount.com"
origin=https://tired.events
tag=public-check
flags=(--project="$service" --region="$region")
registry="us-west1-docker.pkg.dev/$service/cloud-run-source-deploy/$service/tired-social-staging"
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

if [[ $# -ne 2 || ! $1 =~ ^tired-social-platform-[a-z0-9-]+$ || ! $2 =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo 'Usage: bash scripts/release-production.sh PREVIOUS_REVISION sha256:STAGING_IMAGE_DIGEST' >&2
  exit 2
fi
previous=$1
image="$registry@$2"

current_revision() {
  gcloud run services describe "$service" "${flags[@]}" --format=json |
    jq -er '.status.traffic[] | select(.percent==100) | .revisionName'
}

smoke() {
  EXPECTED_CLOUD_RUN_REVISION="$1" node "$script_dir/check-production.mjs"
}

if [[ $(current_revision) != "$previous" ]]; then
  echo "Production traffic is no longer fully on $previous. Check the current revision." >&2
  exit 1
fi
smoke "$previous"

# Staging and production tags share a Cloud Run service template. Rebuild the
# live bindings from the revision actually serving users on every release.
booking_config=$(gcloud run revisions describe "$previous" "${flags[@]}" --format=json |
  jq -c '[.spec.containers[0].env[]? | select(.name | startswith("STRIPE_LIVE_"))]')
platform=$(jq -r '.[] | select(.name=="STRIPE_LIVE_PLATFORM_ACCOUNT") | .value' <<<"$booking_config")
key_version=$(jq -r '.[] | select(.name=="STRIPE_LIVE_BOOKING_KEY") | .valueFrom.secretKeyRef.key' <<<"$booking_config")
webhook_version=$(jq -r '.[] | select(.name=="STRIPE_LIVE_BOOKING_WEBHOOK") | .valueFrom.secretKeyRef.key' <<<"$booking_config")
collections=$(jq -r '.[] | select(.name=="STRIPE_LIVE_COLLECTIONS_ENABLED") | .value' <<<"$booking_config")
case "${PREPARE_LIVE_BOOKINGS:-0}/${ACTIVATE_LIVE_BOOKINGS:-0}" in
  0/0) ;;
  1/0) collections=0 ;;
  0/1) collections=1 ;;
  *) echo 'Select at most one live payment stage.' >&2; exit 2 ;;
esac
if [[ ${PREPARE_LIVE_BOOKINGS:-0} == 1 || ${ACTIVATE_LIVE_BOOKINGS:-0} == 1 ]]; then
  platform=${LIVE_PLATFORM_ACCOUNT:?Set the verified Tired Studios Stripe account ID}
  key_version=${LIVE_KEY_VERSION:?Supply the verified server key version}
  webhook_version=${LIVE_WEBHOOK_VERSION:?Supply the signing secret version}
fi
env_update="PUBLIC_ORIGIN=$origin"
env_remove=STRIPE_CONNECT_TEST_ENABLED,STRIPE_BOOKING_TEST_FEE_BPS
secret_remove=STRIPE_TEST_SECRET_KEY,STRIPE_TEST_WEBHOOK_SECRET
secret_update=()
if [[ -n "$platform$key_version$webhook_version" || "$booking_config" != '[]' ]]; then
  [[ "$platform" =~ ^acct_[A-Za-z0-9]+$ && "$key_version" =~ ^[1-9][0-9]*$ && "$webhook_version" =~ ^[1-9][0-9]*$ ]]
  collections=${collections:-0}
  [[ "$collections" =~ ^[01]$ ]]
  env_update+=",STRIPE_LIVE_PLATFORM_ACCOUNT=$platform,STRIPE_LIVE_COLLECTIONS_ENABLED=$collections"
  secret_update=(--update-secrets="STRIPE_LIVE_BOOKING_KEY=tired-stripe-live-booking-key:$key_version,STRIPE_LIVE_BOOKING_WEBHOOK=tired-stripe-live-booking-webhook:$webhook_version")
else
  env_remove+=,STRIPE_LIVE_PLATFORM_ACCOUNT,STRIPE_LIVE_COLLECTIONS_ENABLED
  secret_remove+=,STRIPE_LIVE_BOOKING_KEY,STRIPE_LIVE_BOOKING_WEBHOOK
fi

gcloud run deploy "$service" "${flags[@]}" --image="$image" \
  --tag="$tag" --service-account="$production_runtime" --no-traffic --update-env-vars="$env_update" --remove-env-vars="$env_remove" \
  --remove-secrets="$secret_remove" "${secret_update[@]}"

route=$(gcloud run services describe "$service" "${flags[@]}" --format=json |
  jq -ce --arg tag "$tag" '.status.traffic[] | select(.tag==$tag and (.percent // 0)==0)')
preview=$(jq -er '.url' <<<"$route")
candidate=$(jq -er '.revisionName' <<<"$route")
gcloud run revisions describe "$candidate" "${flags[@]}" --format=json |
  jq -e --arg image "$image" --arg runtime "$production_runtime" '
    .status.imageDigest==$image and .spec.serviceAccountName==$runtime and
    all(.spec.containers[0].env[]?; (.name | startswith("STRIPE_TEST_") | not))
  ' >/dev/null

curl -fsS --max-time 15 "$preview/api/health" |
  jq -e --arg revision "$candidate" '.status=="ok" and .revision==$revision' >/dev/null
curl -sS --max-time 15 -X POST -d '{}' "$preview/api/v1/ticket-webhook" |
  jq -e '.error.code=="sandbox_checkout_unavailable"' >/dev/null
payment_status() {
  [[ -z "$platform" ]] || curl -fsS --max-time 15 "$1/api/v1/payments/status" |
    jq -e --arg enabled "$collections" '.mode=="live" and .sellerOnboarding==true and .checkoutEnabled==($enabled=="1")' >/dev/null
}
payment_status "$preview"
if [[ -n "$platform" ]]; then
  curl -sS --max-time 15 -X POST -d '{}' "$preview/api/v1/booking-webhook" |
    jq -e '.error.code=="invalid_signature"' >/dev/null
fi
redirect=$(curl -fsS --max-time 15 -o /dev/null -w '%{redirect_url}' "$preview/auth/google")
node -e 'if (new URL(process.argv[1]).searchParams.get("redirect_uri") !== "https://tired.events/auth/google/callback") process.exit(1)' "$redirect"

if [[ $(current_revision) != "$previous" ]]; then
  echo 'Traffic changed during validation. Promotion stopped.' >&2
  exit 1
fi
gcloud run services update-traffic "$service" "${flags[@]}" --to-revisions="$candidate=100"

for attempt in {1..5}; do
  if smoke "$candidate" && payment_status "$origin"; then
    echo "Production verified on $candidate. Rollback revision is $previous."
    exit 0
  fi
  if (( attempt < 5 )); then sleep 5; fi
done

if [[ $(current_revision) != "$candidate" ]]; then
  echo 'Traffic changed after promotion. Automatic rollback stopped.' >&2
  exit 1
fi
gcloud run services update-traffic "$service" "${flags[@]}" --to-revisions="$previous=100"
for attempt in {1..5}; do
  if smoke "$previous"; then
    echo "Promotion failed health checks. Production restored to $previous." >&2
    exit 1
  fi
  if (( attempt < 5 )); then sleep 5; fi
done
echo "Rollback traffic update completed. Smoke checks for $previous still fail." >&2
exit 1
