#!/usr/bin/env bash
set -euo pipefail

service=tired-social-platform
region=europe-west1
sandbox_runtime="tired-social-runtime@$service.iam.gserviceaccount.com"
origin=https://ticket-test---tired-social-platform-y3dmxghtqa-ew.a.run.app
flags=(--project="$service" --region="$region")
commit=${1:?Pass the full commit SHA to stage.}
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a full Git commit SHA.' >&2; exit 1; }
git cat-file -e "$commit^{commit}"

tag="$region-docker.pkg.dev/$service/cloud-run-source-deploy/$service/$service:$commit"
image_for_tag() {
  gcloud artifacts docker images describe "$tag" --project="$service"     --format='value(image_summary.fully_qualified_digest)'
}
image=$(image_for_tag 2>/dev/null || true)
if [[ -z "$image" ]]; then
  source_dir=$(mktemp -d)
  trap 'rm -rf "$source_dir"' EXIT
  git archive "$commit" | tar -x -C "$source_dir"
  gcloud builds submit "$source_dir" --project="$service" --tag="$tag" --quiet
  image=$(image_for_tag)
fi
[[ "$image" =~ @sha256:[a-f0-9]{64}$ ]]

gcloud run jobs update tired-social-migrate "${flags[@]}" --image="$image"
gcloud run jobs execute tired-social-migrate "${flags[@]}" --wait
gcloud run deploy "$service" "${flags[@]}" --image="$image" --tag=ticket-test --service-account="$sandbox_runtime" --no-traffic --remove-env-vars=STRIPE_LIVE_PLATFORM_ACCOUNT,STRIPE_LIVE_COLLECTIONS_ENABLED --remove-secrets=STRIPE_LIVE_BOOKING_KEY,STRIPE_LIVE_BOOKING_WEBHOOK --quiet \
  --update-env-vars="PUBLIC_ORIGIN=$origin,STRIPE_CONNECT_TEST_ENABLED=1,STRIPE_BOOKING_TEST_FEE_BPS=750" \
  --update-secrets="STRIPE_TEST_SECRET_KEY=tired-stripe-test-key:latest,STRIPE_TEST_WEBHOOK_SECRET=tired-stripe-ticket-test-webhook:latest"

route=$(gcloud run services describe "$service" "${flags[@]}" --format=json |
  jq -ce '.status.traffic[] | select(.tag=="ticket-test" and (.percent // 0)==0)')
revision=$(jq -er '.revisionName' <<<"$route")
[[ $(jq -er '.url' <<<"$route") == "$origin" ]]
gcloud run revisions describe "$revision" "${flags[@]}" --format=json |
  jq -e --arg image "$image" --arg runtime "$sandbox_runtime" '
    .status.imageDigest==$image and .spec.serviceAccountName==$runtime and
    all(.spec.containers[0].env[]?; (.name | startswith("STRIPE_LIVE_") | not))
  ' >/dev/null
curl -fsS --max-time 20 "$origin/api/health" |
  jq -e --arg revision "$revision" 'select(.status=="ok" and .revision==$revision)'
