#!/usr/bin/env bash
set -euo pipefail

service=tired-social-platform
region=europe-west1
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

gcloud run deploy "$service" "${flags[@]}" --image="$image" \
  --tag="$tag" --no-traffic \
  --update-env-vars="PUBLIC_ORIGIN=$origin" \
  --remove-env-vars=STRIPE_CONNECT_TEST_ENABLED,STRIPE_BOOKING_TEST_FEE_BPS \
  --remove-secrets=STRIPE_TEST_SECRET_KEY,STRIPE_TEST_WEBHOOK_SECRET

route=$(gcloud run services describe "$service" "${flags[@]}" --format=json |
  jq -ce --arg tag "$tag" '.status.traffic[] | select(.tag==$tag and (.percent // 0)==0)')
preview=$(jq -er '.url' <<<"$route")
candidate=$(jq -er '.revisionName' <<<"$route")
actual_image=$(gcloud run revisions describe "$candidate" "${flags[@]}" --format='value(status.imageDigest)')
if [[ "$actual_image" != "$image" ]]; then
  echo "The tagged candidate does not match the requested image." >&2
  exit 1
fi

curl -fsS --max-time 15 "$preview/api/health" |
  jq -e --arg revision "$candidate" '.status=="ok" and .revision==$revision' >/dev/null
curl -sS --max-time 15 -X POST -d '{}' "$preview/api/v1/ticket-webhook" |
  jq -e '.error.code=="sandbox_checkout_unavailable"' >/dev/null
redirect=$(curl -fsS --max-time 15 -o /dev/null -w '%{redirect_url}' "$preview/auth/google")
node -e 'if (new URL(process.argv[1]).searchParams.get("redirect_uri") !== "https://tired.events/auth/google/callback") process.exit(1)' "$redirect"

if [[ $(current_revision) != "$previous" ]]; then
  echo 'Traffic changed during validation. Promotion stopped.' >&2
  exit 1
fi
gcloud run services update-traffic "$service" "${flags[@]}" --to-revisions="$candidate=100"

for attempt in {1..5}; do
  if smoke "$candidate"; then
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
