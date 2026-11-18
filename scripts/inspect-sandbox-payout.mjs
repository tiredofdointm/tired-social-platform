import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {reconcilePayout, usdBalance} from '../server/payout-report.mjs';

function check(condition, message) {
  if (!condition) throw Error(message);
}

export async function inspectBookingPayout(get, transferId, since) {
  let candidates;
  if (transferId) {
    check(/^tr_[A-Za-z0-9]+$/.test(transferId), 'Expected a Stripe transfer ID.');
    candidates = [await get('transfers/' + transferId)];
  } else {
    const page = await get('transfers', {limit: 100, 'created[gte]': since});
    check(!page.has_more, 'More than 100 recent transfers. Supply the booking transfer ID.');
    candidates = page.data;
  }
  const matches = [];
  for (const transfer of candidates) {
    if (transfer.livemode !== false || transfer.currency !== 'usd' || transfer.amount !== 10000 ||
        transfer.amount_reversed !== 0 || !/^ch_[A-Za-z0-9]+$/.test(transfer.source_transaction)) continue;
    const charge = await get('charges/' + transfer.source_transaction);
    if (charge.livemode === false && charge.paid && charge.currency === 'usd' && charge.amount === 10750 &&
        charge.amount_refunded === 0 && charge.transfer === transfer.id &&
        /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(charge.metadata?.tired_booking)) matches.push(transfer);
  }
  check(matches.length === 1, 'Expected one unrefunded sandbox booking. Supply its transfer ID to select it explicitly.');
  const transfer = matches[0];
  const account = transfer.destination;
  check(/^acct_[A-Za-z0-9]+$/.test(account) && /^(py|ch)_[A-Za-z0-9]+$/.test(transfer.destination_payment),
    'The transfer has no verifiable destination payment or account.');
  const [settings, balance, page] = await Promise.all([
    get('accounts/' + account), get('balance', {}, account), get('payouts', {limit: 5}, account)
  ]);
  const {pendingCents, availableCents} = usdBalance(balance);
  const recent = [];
  for (const payout of page.data) {
    const row = await reconcilePayout(payout, params => get('balance_transactions', params, account), transfer.destination_payment);
    recent.push({amount: payout.amount, currency: payout.currency, status: payout.status,
      automatic: payout.automatic, reconciliation_status: payout.reconciliation_status,
      funding_check: row.reconciliation, funding_cents: row.fundingCents, booking_funding_cents: row.bookingFundingCents});
  }
  const linked = recent.filter(row => row.booking_funding_cents !== null);
  const verified = linked.length === 1 && linked[0].funding_check === 'matched' && linked[0].booking_funding_cents === transfer.amount;
  return {
    settings: {payouts_enabled: settings.payouts_enabled, interval: settings.settings.payouts.schedule.interval,
      delay_days: settings.settings.payouts.schedule.delay_days},
    balance: {available_usd_cents: availableCents, pending_usd_cents: pendingCents},
    recent_payouts: recent, older_payouts_exist: page.has_more,
    booking_payout_check: verified ? 'matched' : linked.length ? 'mismatch' : 'unverified'
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const key = readFileSync(0, 'utf8').trim();
    check(key.startsWith('sk_test_'), 'Expected a Stripe sandbox key.');
    async function get(path, params = {}, account) {
      const url = new URL('https://api.stripe.com/v1/' + path);
      url.search = new URLSearchParams(params).toString();
      const headers = {Authorization: 'Bearer ' + key};
      if (account) headers['Stripe-Account'] = account;
      const response = await fetch(url, {headers, redirect: 'error', signal: AbortSignal.timeout(20000)});
      check(response.ok, 'Stripe read failed (HTTP ' + response.status + ').');
      return response.json();
    }
    const report = await inspectBookingPayout(get, process.argv[2], Math.floor(Date.now() / 1000) - 7 * 86400);
    console.log(JSON.stringify(report, null, 2));
    if (report.booking_payout_check === 'mismatch') process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
