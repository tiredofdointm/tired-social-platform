#!/usr/bin/env bash
set +x
set -euo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
gcloud secrets versions access latest --project=tired-social-platform --secret=tired-stripe-test-key |
  node "$script_dir/inspect-sandbox-payout.mjs" "$@"
