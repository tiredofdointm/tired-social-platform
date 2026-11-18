#!/usr/bin/env bash
set -euo pipefail

project=tired-social-platform
region=europe-west1
commit=84b6e686e2a90decc8c99966a7296234da9c2e9c
suffix=bookings-84b6e68
revision="$project-$suffix"
previous="$project-a11y-3e65b48"
live=https://tired.events
flags=(--project="$project" --region="$region")
get() { curl -fsS --retry 3 --max-time 20 "$1"; }
check_site() {
  get "$1/api/health" | jq -e --arg rev "$revision" '.status=="ok" and .revision==$rev' >/dev/null &&
    get "$1/api/v1/auth/config" | jq -e '.mode=="google"' >/dev/null &&
    get "$1/app.js" | grep -F 'Awaiting provider approval' >/dev/null
}
traffic() {
  gcloud run services describe "$project" "${flags[@]}" --format='json(status.traffic)' |
    jq -er '.status.traffic[] | select(.percent==100) | .revisionName'
}
if [[ $(traffic) == "$revision" ]]; then
  check_site "$live"
  get "$live/api/health"
  exit 0
fi
[[ $(traffic) == "$previous" ]] || { echo 'Production traffic changed. Inspect the service before continuing.' >&2; exit 1; }
registry="$region-docker.pkg.dev/$project/cloud-run-source-deploy/$project/$project"
resolve() {
  gcloud artifacts docker images describe "$1" --project="$project" --format='value(image_summary.fully_qualified_digest)'
}
image=$(resolve "us-west1-docker.pkg.dev/$project/cloud-run-source-deploy/$project/tired-social-staging:$commit" 2>/dev/null || true)
if [[ -z "$image" ]]; then
  image=$(resolve "$registry:$commit" 2>/dev/null || true)
fi
if [[ -z "$image" ]]; then
  source_dir=$(mktemp -d)
  trap 'rm -rf "$source_dir"' EXIT
  git clone --quiet https://github.com/tiredofdointm/tired-social-platform.git "$source_dir"
  git -C "$source_dir" checkout --quiet --detach "$commit"
  gcloud builds submit "$source_dir" --project="$project" --tag="$registry:$commit"
  image=$(resolve "$registry:$commit")
fi
[[ "$image" =~ @sha256:[a-f0-9]{64}$ ]]
gcloud run jobs update tired-social-migrate "${flags[@]}" --image="$image"
gcloud run jobs execute tired-social-migrate "${flags[@]}" --wait
if ! gcloud run revisions describe "$revision" "${flags[@]}" --format='value(metadata.name)' >/dev/null 2>&1; then
  gcloud run deploy "$project" "${flags[@]}" --image="$image" --revision-suffix="$suffix" --tag="$suffix" --no-traffic
fi
[[ $(gcloud run revisions describe "$revision" "${flags[@]}" --format='value(status.imageDigest)') == "$image" ]]
route=$(gcloud run services describe "$project" "${flags[@]}" --format='json(status.traffic)' |
  jq -er --arg tag "$suffix" --arg rev "$revision" '.status.traffic[] | select(.tag==$tag and .revisionName==$rev) | .url')
check_site "$route"
[[ $(traffic) == "$previous" ]]
gcloud run services update-traffic "$project" "${flags[@]}" --to-revisions="$revision=100"
for attempt in {1..10}; do
  if check_site "$live"; then get "$live/api/health"; exit 0; fi
  sleep 3
done
if [[ $(traffic) == "$revision" ]]; then
  gcloud run services update-traffic "$project" "${flags[@]}" --to-revisions="$previous=100"
fi
echo 'Production verification failed. Inspect Cloud Run traffic and logs.' >&2
exit 1
