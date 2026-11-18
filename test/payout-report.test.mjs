import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcilePayout} from '../server/payout-report.mjs';
import {inspectBookingPayout} from '../scripts/inspect-sandbox-payout.mjs';

const payout = {id:'po_test', automatic:true, type:'bank_account', currency:'usd', livemode:false,
  amount:12000, status:'paid', reconciliation_status:'completed', balance_transaction:'txn_out'};
const transfer = {id:'tr_123', destination:'acct_123', source_transaction:'ch_123', destination_payment:'py_123',
  amount:10000, amount_reversed:0, livemode:false, currency:'usd'};

function fixture({payouts=[payout],source='py_123',net=10000}={}) {
  return async (path,params,account) => {
    if (['payouts','balance','balance_transactions'].includes(path)) assert.equal(account,'acct_123');
    switch (path) {
      case 'transfers/tr_123': return transfer;
      case 'charges/ch_123': return {transfer:transfer.id,livemode:false,paid:true,currency:'usd',amount:10750,
        amount_refunded:0,metadata:{tired_booking:'00000000-0000-4000-a000-000000000000'}};
      case 'accounts/acct_123': return {payouts_enabled:true,settings:{payouts:{schedule:{interval:'daily',delay_days:2}}}};
      case 'balance': return {livemode:false,available:[],pending:[{currency:'usd',amount:10000}]};
      case 'payouts': return {data:payouts,has_more:false};
      case 'balance_transactions':
        assert.equal(params.payout,payout.id);
        if (!params.starting_after) return {data:[{id:'txn_out'},{id:'txn_other',source:'py_other',currency:'usd',net:2000}],has_more:true};
        assert.equal(params.starting_after,'txn_other');
        return {data:[{id:'txn_booking',source,currency:'usd',net}],has_more:false};
      default: assert.fail('Unexpected Stripe read ' + path);
    }
  };
}

test('links a specific booking across payout pages and excludes the payout debit', async () => {
  const report = await inspectBookingPayout(fixture(),'tr_123');
  assert.equal(report.booking_payout_check,'matched');
  assert.equal(report.recent_payouts[0].funding_cents,12000);
  assert.equal(report.recent_payouts[0].booking_funding_cents,10000);
});

test('pending balances, unrelated equal amounts and mismatches do not confirm a booking', async () => {
  for (const [options,expected] of [[{payouts:[]},'unverified'],[{source:'py_else'},'unverified'],[{net:9900},'mismatch']]) {
    const report=await inspectBookingPayout(fixture(options),'tr_123');
    assert.equal(report.booking_payout_check,expected);
    assert.equal(report.balance.pending_usd_cents,10000);
  }
});

test('repeated pages, mixed currencies and a scan limit cannot produce a partial match',async()=>{
  for (const [row,status] of [[{id:'txn_1',currency:'usd',net:10},'incomplete'],[{id:'txn_1',currency:'eur',net:10},'currency_mismatch']]) {
    const result=await reconcilePayout(payout,async()=>({data:[row],has_more:true}));
    assert.equal(result.reconciliation,status);
    assert.equal(result.fundingCents,null);
  }
  let n=0;
  const result=await reconcilePayout(payout,async()=>({data:[{id:'txn_'+(++n),currency:'usd',net:10}],has_more:true}));
  assert.equal(result.reconciliation,'more_entries');
  assert.equal(result.fundingCents,null);
  assert.equal(n,10);
});
