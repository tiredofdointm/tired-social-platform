#!/usr/bin/env bash
set +x
set -euo pipefail

project=tired-social-platform
expected_total=10750
expected_service=10000
expected_fee=$((expected_total - expected_service))
since=$(date -u -d '24 hours ago' +%s)

key=$(gcloud secrets versions access latest --project="$project" --secret=tired-stripe-test-key)
[[ "$key" == sk_test_* ]] || { echo 'Expected a Stripe sandbox key.' >&2; exit 1; }

stripe_get() {
  local resource=$1
  shift
  printf 'Authorization: Bearer %s\n' "$key" |
    curl -fsSG --max-time 20 -H @- "https://api.stripe.com/v1/$resource" "$@"
}

sessions=$(stripe_get checkout/sessions --data-urlencode "created[gte]=$since" --data-urlencode 'limit=100')
session=$(jq -ec --argjson total "$expected_total" '
  if .has_more then error("More than 100 recent checkout sessions. Use a narrower time window.") else
    [.data[] | select(.livemode==false and .mode=="payment" and .payment_status=="paid"
      and .amount_total==$total and .currency=="usd"
      and (.metadata.tired_booking // "" | test("^[a-fA-F0-9-]{36}$")))] |
    if length==1 then .[0] else error("Expected one matching paid sandbox booking. Found \(length).") end
  end' <<<"$sessions")
intent_id=$(jq -er '.payment_intent | select(test("^pi_[A-Za-z0-9]+$"))' <<<"$session")
booking_id=$(jq -er '.metadata.tired_booking' <<<"$session")
intent=$(stripe_get "payment_intents/$intent_id" --data-urlencode 'expand[]=latest_charge')
jq -e --arg id "$booking_id" --argjson total "$expected_total" --argjson service "$expected_service" '
  .livemode==false and .status=="succeeded" and .currency=="usd" and .amount_received==$total
  and .metadata.tired_booking==$id and .transfer_data.amount==$service
  and .latest_charge.livemode==false and .latest_charge.paid==true' <<<"$intent" >/dev/null
charge_id=$(jq -er '.latest_charge.id | select(test("^ch_[A-Za-z0-9]+$"))' <<<"$intent")
transfer_id=$(jq -er '.latest_charge.transfer | select(test("^tr_[A-Za-z0-9]+$"))' <<<"$intent")
destination=$(jq -er '.transfer_data.destination | select(test("^acct_[A-Za-z0-9]+$"))' <<<"$intent")
transfer=$(stripe_get "transfers/$transfer_id")
unset key
jq -e --arg charge "$charge_id" --arg destination "$destination"     --argjson service "$expected_service" --argjson total "$expected_total" --argjson fee "$expected_fee" '
  select(.livemode==false and .currency=="usd" and .source_transaction==$charge
    and .destination==$destination and .amount==$service)
  | {booking_payment_cents:$total,platform_fee_cents:$fee,provider_transfer_cents:.amount,
      provider_transfer_reversed_cents:.amount_reversed,currency:.currency}' <<<"$transfer"
