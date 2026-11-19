import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {createServer} from '../../server.mjs';
import {authRepository,createAuthHandler,SESSION_COOKIE} from '../../server/auth.mjs';
import {createSocialHandler} from '../../server/social-http.mjs';
import {liveRecords,LIVE_BOOKING_FEE_BPS} from '../../server/live-booking-config.mjs';

export async function liveBookingChecks(t,pool) {
 await t.test('live booking fees and settlement stay isolated from sandbox records',async()=>{
  const config={origin:'https://tired.events'};
  const users=authRepository(pool);
  const customer=await users.signIn({issuer:'live-mode-fixture',subject:'buyer',name:'Booking buyer'});
  const provider=await users.signIn({issuer:'live-mode-fixture',subject:'provider',name:'Booking provider'});
  const signatureKey='whsec_local_mode_check';
  const stripe=new Stripe('sk_test_local_fixture');
  const destination='acct_LiveFixture';
  let metadata, paymentIntent;
  const connect={
   accounts:{retrieve:async id=>{assert.equal(id,destination);return {capabilities:{transfers:'active'},payouts_enabled:true};}},
   checkout:{sessions:{create:async options=>{
    assert.deepEqual(options.line_items.map(item=>item.price_data.unit_amount),[10000,750]);
    assert.deepEqual(options.payment_intent_data.transfer_data,{destination,amount:10000});
    metadata=options.metadata;
    assert.equal(metadata.tired_platform,'tired.events');
    paymentIntent='pi_liveFixture';
    return {id:'cs_liveFixture',livemode:true,status:'open',url:'https://checkout.stripe.com/c/pay/cs_liveFixture'};
   }}},
   refunds:{create:async params=>{
    assert.deepEqual(params,{payment_intent:paymentIntent,reverse_transfer:true});
    return {status:'succeeded'};
   }}
  };
  const verifyLiveBooking=(raw,sig)=>stripe.webhooks.constructEvent(raw,sig,signatureKey);
  let live=true;
  const production=createSocialHandler({pool,config,connect,payments:null,bookingFeeBps:LIVE_BOOKING_FEE_BPS,records:liveRecords,verifyLiveBooking});
  const sandbox=createSocialHandler({pool,config:{origin:'https://sandbox.example.test'},connect,payments:null,bookingFeeBps:750});
  const server=createServer({auth:createAuthHandler({config,pool,provider:{}}),social:(...args)=>(live?production:sandbox)(...args)});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1/';
  async function api(account,path,method='GET',body) {
   const response=await fetch(base+path,{method,headers:{cookie:SESSION_COOKIE+'='+account.token,
    'x-csrf-token':account.csrf??'',origin:live?config.origin:'https://sandbox.example.test','content-type':'application/json'},
    body:body===undefined?undefined:JSON.stringify(body)});
   return {status:response.status,data:await response.json()};
  }
  async function webhook(type,object,livemode=true) {
   const payload=JSON.stringify({id:'evt_fixture',type,livemode,data:{object}});
   const sig=stripe.webhooks.generateTestHeaderString({payload,secret:signatureKey});
   return (await fetch(base+'booking-webhook',{method:'POST',body:payload,headers:{'stripe-signature':sig}})).status;
  }
  try {
   for(const account of [customer,provider])account.csrf=(await api(account,'me')).data.csrfToken;
   const listing=(await pool.query("INSERT INTO service_listings(owner_id,title,category,description,publication) VALUES($1,'Paid shoot','Photography','One hour','published') RETURNING id",[provider.userId])).rows[0];
   const slot=(await pool.query("INSERT INTO service_slots(listing_id,provider_id,starts_at) VALUES($1,$2,date_trunc('hour',now())+interval '8 days') RETURNING id",[listing.id,provider.userId])).rows[0];
   await pool.query('INSERT INTO live_provider_connect_accounts(provider_id,stripe_account_id) VALUES($1,$2)',[provider.userId,destination]);
   await pool.query("INSERT INTO provider_connect_accounts(provider_id,stripe_account_id) VALUES($1,'acct_SandboxFixture')",[provider.userId]);
   const booking=(await api(customer,'services/slots/'+slot.id+'/request','POST')).data;
   assert.ok(booking.request_id);
   const path='services/bookings/'+booking.request_id;
   assert.equal((await api(provider,path+'/confirm','POST',{servicePriceCents:10000})).status,200);
   const list=(await api(customer,'services/bookings')).data;
   assert.equal(list.liveBookings,true);
   assert.deepEqual(list.bookings[0].quote,{serviceCents:10000,feeCents:750,totalCents:10750});
   live=false;
   assert.equal((await api(customer,'services/bookings')).data.bookings.length,0);
   assert.equal((await api(customer,path+'/checkout','POST')).status,404);
   assert.equal((await api(customer,path+'/cancel','POST')).status,409);
   live=true;
   assert.equal((await api(customer,path+'/checkout','POST')).status,200);
   const paid={client_reference_id:booking.request_id,id:'cs_liveFixture',mode:'payment',payment_status:'paid',currency:'usd',amount_total:10750,payment_intent:paymentIntent,metadata};
   // Recover from a lost response before the Checkout session ID was saved.
   await pool.query('UPDATE live_booking_payments SET session_id=NULL WHERE request_id=$1',[booking.request_id]);
   assert.equal(await webhook('checkout.session.completed',paid,false),400);
   assert.equal(await webhook('checkout.session.completed',paid),200);
   assert.equal(await webhook('checkout.session.completed',paid),200);
   assert.equal((await api(customer,'services/bookings')).data.bookings[0].payment_state,'paid');
   assert.equal((await api(customer,path+'/refund','POST')).status,404);
   assert.equal((await api(provider,path+'/refund','POST')).status,200);
   const refunded={id:'ch_liveFixture',currency:'usd',amount:10750,amount_refunded:10750,payment_intent:paymentIntent,metadata};
   assert.equal(await webhook('charge.refunded',refunded),200);
   assert.equal((await api(customer,'services/bookings')).data.bookings[0].payment_state,'refunded');
   assert.equal((await pool.query('SELECT 1 FROM booking_payments WHERE request_id=$1',[booking.request_id])).rowCount,0);
  } finally {await new Promise(resolve=>server.close(resolve));}
 });
}
