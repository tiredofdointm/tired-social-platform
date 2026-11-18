// Bound the work done by a single dashboard request. Partial totals cannot verify a payout.
export async function reconcilePayout(payout, listEntries, destinationPayment = null) {
  const result = {
    id: payout.id, amountCents: payout.amount, currency: payout.currency,
    status: payout.status, arrivalDate: payout.arrival_date,
    entries: null, fundingCents: null, bookingFundingCents: null
  };
  const finish = reconciliation => ({...result, reconciliation});
  if (payout.livemode !== false) throw Error('Expected a sandbox payout');
  if (!payout.automatic || payout.type !== 'bank_account' || payout.currency !== 'usd') return finish('unsupported');
  if (['failed', 'canceled'].includes(payout.status)) return finish('not_paid');
  if (payout.reconciliation_status === 'not_applicable') return finish('unsupported');
  if (payout.status !== 'paid' || payout.reconciliation_status !== 'completed') return finish('pending');

  const seen = new Set();
  let cursor, entries = 0, funding = 0, bookingFunding = null;
  for (let page = 0; page < 10; page++) {
    const params = {payout: payout.id, limit: 100};
    if (cursor) params.starting_after = cursor;
    const {data, has_more} = await listEntries(params);
    if (!Array.isArray(data) || typeof has_more !== 'boolean') return finish('incomplete');
    for (const entry of data) {
      if (!entry.id || seen.has(entry.id)) return finish('incomplete');
      seen.add(entry.id);
      if (entry.id === payout.balance_transaction || entry.source === payout.id) continue;
      if (entry.currency !== payout.currency) return finish('currency_mismatch');
      if (!Number.isSafeInteger(entry.net)) return finish('incomplete');
      entries++;
      funding += entry.net;
      if (destinationPayment && entry.source === destinationPayment) bookingFunding = (bookingFunding ?? 0) + entry.net;
    }
    if (!has_more) {
      if (!entries) return finish('unavailable');
      return {...result, entries, fundingCents: funding, bookingFundingCents: bookingFunding,
        reconciliation: funding === payout.amount ? 'matched' : 'mismatch'};
    }
    if (!data.length) return finish('incomplete');
    cursor = data[data.length - 1].id;
  }
  return finish('more_entries');
}

export function usdBalance(balance) {
  if (balance.livemode !== false) throw Error('Expected a sandbox balance');
  const sum = amounts => amounts.filter(row => row.currency === 'usd').reduce((total, row) => total + row.amount, 0);
  return {availableCents: sum(balance.available), pendingCents: sum(balance.pending)};
}
