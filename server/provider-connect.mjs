import {sandboxRecords} from './live-booking-config.mjs';
import Stripe from 'stripe';
import {recentPayouts, usdBalance} from './payout-report.mjs';
import {transaction} from './database.mjs';

export function testConnect(env=process.env){
 if(env.STRIPE_CONNECT_TEST_ENABLED!=='1')return null;
 if(!env.STRIPE_TEST_SECRET_KEY?.startsWith('sk_test_'))throw Error('Stripe Connect requires a sandbox key');
 return new Stripe(env.STRIPE_TEST_SECRET_KEY,{timeout:5000,maxNetworkRetries:0});
}

export async function providerConnect({pool,connect,actor,method,origin,send,fail,records=sandboxRecords,organizer=false}){
 if(!connect)return send(200,{enabled:false});
 if(!['GET','POST'].includes(method))fail(405,'method_not_allowed');
 const result=await transaction(pool,async db=>{
  const provider=await db.query(`SELECT id FROM users WHERE id=$1 AND status='active'
   AND ($2::boolean OR EXISTS(SELECT 1 FROM service_listings WHERE owner_id=$1 AND publication='published' AND withdrawn_at IS NULL))
   FOR NO KEY UPDATE`,[actor,organizer]);
  if(!provider.rowCount)return {enabled:true,eligible:false};

  const existing=await db.query(`SELECT stripe_account_id FROM ${records.accounts} WHERE provider_id=$1`,[actor]);
  let accountId=existing.rows[0]?.stripe_account_id;
  if(!accountId && method==='POST'){
   const account=await connect.accounts.create({country:'US',
    controller:{fees:{payer:'application'},losses:{payments:'application'},requirement_collection:'stripe',stripe_dashboard:{type:'express'}},
    capabilities:{transfers:{requested:true}}
   },{idempotencyKey:(records.live?'live-provider-':'sandbox-provider-')+actor});
   accountId=account.id;
   await db.query(`INSERT INTO ${records.accounts}(provider_id,stripe_account_id) VALUES($1,$2)`,[actor,accountId]);
  }
  return {enabled:true,eligible:true,accountId};
 });
 if(!result.accountId)return send(200,{enabled:result.enabled,eligible:result.eligible,connected:false});

 const account=await connect.accounts.retrieve(result.accountId);
 const status={enabled:true,eligible:true,connected:true,detailsSubmitted:account.details_submitted===true,
  transfersEnabled:account.capabilities?.transfers==='active',payoutsEnabled:account.payouts_enabled===true};
 if(method==='GET')return send(200,status);

 const returnUrl=origin+(organizer?'/#shared-events':'/#talent');
 const link=await connect.accountLinks.create({account:result.accountId,type:'account_onboarding',return_url:returnUrl,refresh_url:returnUrl});
 if(new URL(link.url).origin!=='https://connect.stripe.com')fail(503,'onboarding_unavailable');
 return send(200,{...status,url:link.url});
}

export async function providerPayouts({pool,connect,actor,method,send,fail,records=sandboxRecords}){
 if(method!=='GET')fail(405,'method_not_allowed');
 if(!connect)fail(503,'sandbox_payouts_unavailable');
 const {rows:[provider]}=await pool.query(`SELECT stripe_account_id FROM ${records.accounts} WHERE provider_id=$1`,[actor]);
 if(!provider)fail(404,'not_found');

 const account=provider.stripe_account_id;
 const [payouts,balance,bookings]=await Promise.all([
  recentPayouts(connect,account,fail,null,records.live),
  connect.balance.retrieve({},{stripeAccount:account}),
  pool.query(`SELECT b.request_id AS id, l.title, s.starts_at AS "startsAt", b.service_cents AS "serviceCents"
   FROM ${records.payments} b JOIN service_slots s ON s.request_id=b.request_id
   JOIN service_listings l ON l.id=s.listing_id
   WHERE s.provider_id=$1 AND b.destination_account=$2 AND b.state='paid' AND b.refunded_cents=0
   ORDER BY b.expires_at DESC, b.request_id LIMIT 20`,[actor,account])
 ]);
 if(balance.livemode!==records.live)fail(503,'sandbox_payouts_unavailable');
 return send(200,{payouts,balance:usdBalance(balance,records.live),bookings:bookings.rows});
}
