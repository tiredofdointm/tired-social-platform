#!/usr/bin/env bash
set +x
set -euo pipefail

project=tired-social-platform
key=$(gcloud secrets versions access latest --project="$project" --secret=tired-stripe-test-key)
[[ "$key" == sk_test_* ]] || { echo 'Expected a Stripe sandbox key.' >&2; exit 1; }

stripe_get() {
  local path=$1
  shift
  printf 'Authorization: Bearer %s\n' "$key" |
    curl -fsSG --max-time 20 -H @- "https://api.stripe.com/v1/$path" "$@"
}

since=$(date -u -d '7 days ago' +%s)
transfers=$(stripe_get transfers --data-urlencode "created[gte]=$since" --data-urlencode 'limit=100')
candidates=$(jq -er '
  if .has_more then error("More than 100 transfers in the diagnostic window.") else
    .data[] | select(.livemode==false and .currency=="usd" and .amount==10000 and .amount_reversed==0)
    | [.source_transaction,.destination]
    | select((.[0] // "" | test("^ch_[A-Za-z0-9]+$")) and (.[1] // "" | test("^acct_[A-Za-z0-9]+$")))
    | @tsv
  end' <<<"$transfers") || { echo 'No unrefunded $100 sandbox transfer found in the last seven days.' >&2; exit 1; }

matches=()
while IFS=$'\t' read -r charge destination; do
  record=$(stripe_get "charges/$charge")
  if jq -e '.livemode==false and .paid==true and .amount==10750 and .currency=="usd"
     and (.metadata.tired_booking // "" | test("^[a-f0-9-]{36}$";"i"))' <<<"$record" >/dev/null; then
    matches+=("$destination")
  fi
done <<<"$candidates"
[[ ${#matches[@]} == 1 ]] || { echo "Expected one matching booking transfer. Found ${#matches[@]}." >&2; exit 1; }

account=${matches[0]}
account_status=$(stripe_get "accounts/$account" | jq -c '{
  payouts_enabled,interval:.settings.payouts.schedule.interval,
  delay_days:.settings.payouts.schedule.delay_days
}')
balance=$(stripe_get balance -H "Stripe-Account: $account" | jq -ec '
  select(.livemode==false) | {
  available_usd_cents:([.available[] | select(.currency=="usd") | .amount] | add // 0),
  pending_usd_cents:([.pending[] | select(.currency=="usd") | .amount] | add // 0)
}')
payouts=$(stripe_get payouts -H "Stripe-Account: $account" --data-urlencode 'limit=5' | jq -ce '
 if any(.data[]; .livemode!=false) then error("Expected sandbox payouts") else
 [.data[] | {amount,currency,status,automatic,reconciliation_status}] end')
unset key
jq -n --argjson settings "$account_status" --argjson balance "$balance" --argjson payouts "$payouts" \
 '{settings:$settings,balance:$balance,recent_payouts:$payouts}'
