import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {createServer} from '../../server.mjs';
import {authRepository,createAuthHandler,SESSION_COOKIE} from '../../server/auth.mjs';
import {createSocialHandler} from '../../server/social-http.mjs';
import {liveRecords,LIVE_BOOKING_FEE_BPS} from '../../server/live-booking-config.mjs';

export async function liveBookingChecks(t,pool) {
 await t.test('live booking fees and settlement stay isolated from sandbox records',async scenario=>{
  const config={origin:'https://tired.events'};
  const users=authRepository(pool);
  const customer=await users.signIn({issuer:'live-mode-fixture',subject:'buyer',name:'Booking buyer'});
  const provider=await users.signIn({issuer:'live-mode-fixture',subject:'provider',name:'Booking provider'});
  const signatureKey='whsec_local_mode_check';
  const stripe=new Stripe('sk_test_local_fixture');
  const destination='acct_LiveFixture';
  let metadata, paymentIntent;
  let accountCreations=0;
  const connect={
   accountLinks:{create:async()=>({url:"https://connect.stripe.com/setup/fixture"})},
   accounts:{create:async input=>{
    assert.deepEqual(input.capabilities,{card_payments:{requested:true},transfers:{requested:true}});
    accountCreations++;return {id:destination};
   },retrieve:async id=>{assert.equal(id,destination);return {capabilities:{transfers:'active'},payouts_enabled:true};}},
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
  const ticketPayments={live:true,accounts:connect.accounts,sessions:connect.checkout.sessions,refunds:connect.refunds};
  let paused=false;
  const liveOptions={pool,config,connect,payments:null,ticketPayments,bookingFeeBps:LIVE_BOOKING_FEE_BPS,records:liveRecords,verifyLiveBooking};
  const production=createSocialHandler({...liveOptions,liveCollectionsEnabled:true});
  const onboarding=createSocialHandler(liveOptions);
  const sandbox=createSocialHandler({pool,config:{origin:'https://sandbox.example.test'},connect,payments:{sessions:connect.checkout.sessions},bookingFeeBps:750});
  const server=createServer({auth:createAuthHandler({config,pool,provider:{}}),social:(...args)=>(live?(paused?onboarding:production):sandbox)(...args)});
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
   paused=true;
   for(let attempt=0;attempt<2;attempt++){
    const setup=await api(provider,'events/connect','POST');
    assert.equal(setup.data.url,'https://connect.stripe.com/setup/fixture');
   }
   assert.equal(accountCreations,1);
   paused=false;
   await pool.query("INSERT INTO provider_connect_accounts(provider_id,stripe_account_id) VALUES($1,'acct_SandboxFixture')",[provider.userId]);
   const booking=(await api(customer,'services/slots/'+slot.id+'/request','POST')).data;
   assert.ok(booking.request_id);
   const path='services/bookings/'+booking.request_id;
   assert.equal((await api(provider,path+'/confirm','POST',{servicePriceCents:10000})).status,200);
   const list=(await api(customer,'services/bookings')).data;
   assert.equal(list.liveBookings,true);
   paused=true;
   assert.deepEqual((await api(customer,'payments/status')).data,{mode:'live',sellerOnboarding:true,checkoutEnabled:false});
   assert.equal((await api(customer,'services/bookings')).data.checkoutEnabled,false);
   assert.equal((await api(customer,path+'/checkout','POST')).data.error.code,'live_checkout_paused');
   assert.equal((await api(provider,'events/connect')).data.transfersEnabled,true);
   assert.equal((await api(provider,'services/connect')).status,200);
   assert.equal((await api(customer,'events')).data.checkoutEnabled,false);
   const event={title:'Onboarding fixture',venue:'Room',startsAt:new Date(Date.now()+86400000).toISOString(),capacity:1};
   assert.equal((await api(provider,'events','POST',{...event,ticketPriceCents:10000})).data.error.code,'live_checkout_paused');
   assert.equal((await api(provider,'events','POST',event)).status,201);
   for(const [action,method] of [['ticket-hold','PUT'],['checkout','POST']]){
    assert.equal((await api(customer,'events/'+slot.id+'/'+action,method)).data.error.code,'live_checkout_paused');
   }
   assert.equal(await webhook('tired.delivery_check',{}),200);
   paused=false;
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
   await scenario.test('ticket fees, organizer payments, reserved inventory and refunds use the correct environment',async()=>{
    const draft={title:'Ticket fixture',venue:'Room A',startsAt:new Date(Date.now()+48*3600000).toISOString(),capacity:1,ticketPriceCents:10000};
    assert.equal((await api(customer,'events','POST',draft)).status,409);
    assert.equal((await api(provider,'events/connect')).data.transfersEnabled,true);
    const created=await api(provider,'events','POST',draft);
    assert.equal(created.status,201);
    const eid=created.data.id;
    // Simulate publication if the previous scenario enabled manual review.
    await pool.query("UPDATE events SET publication='published' WHERE id=$1",[eid]);
    const path='events/'+eid;
    assert.deepEqual((await api(customer,'events?event='+eid)).data.events[0].ticketQuote,{ticketCents:10000,feeCents:750,totalCents:10750});
    assert.equal((await api(customer,path+'/ticket-hold','PUT')).status,200);
    assert.equal((await api(provider,path+'/ticket-hold','PUT')).status,409);
    live=false;
    assert.ok(!(await api(customer,'events?event='+eid)).data.events.some(event=>event.id===eid));
    assert.equal((await api(customer,path+'/checkout','POST')).status,404);
    assert.equal((await api(customer,path+'/ticket-hold','DELETE')).status,404);
    assert.equal((await api(provider,path+'/guest-list')).status,404);
    live=true;
    assert.equal((await api(customer,path+'/checkout','POST')).status,200);
    const order=metadata.tired_ticket_order;
    assert.ok(order);
    const paid={id:'cs_liveFixture',mode:'payment',payment_status:'paid',currency:'usd',amount_total:10750,payment_intent:paymentIntent,metadata};
    assert.equal(await webhook('checkout.session.completed',{...paid,amount_total:10000}),409);
    assert.equal(await webhook('checkout.session.completed',paid),200);
    assert.equal(await webhook('checkout.session.completed',paid),200);
    const worker=await users.signIn({issuer:'live-mode-fixture',subject:'staff',name:'Ticket staff'});
    worker.csrf=(await api(worker,'me')).data.csrfToken;
    const person=(await api(worker,'me/profile','PATCH',{handle:'fixture_staff',display_name:'Ticket staff',bio:'',visibility:'public'}));
    assert.equal(person.status,200);
    const ticket=(await api(customer,'events?event='+eid)).data.events[0];
    const scan={code:ticket.my_ticket_code};
    assert.equal((await api(worker,path+'/check-in','POST',scan)).status,404);
    assert.equal((await api(provider,path+'/staff','PUT',{handle:'fixture_staff'})).status,200);
    assert.equal((await api(provider,path+'/staff','PUT',{handle:'fixture_staff'})).status,200);
    assert.equal((await api(worker,'events?event='+eid)).data.events[0].check_in_staff,true);
    assert.equal((await api(worker,path+'/guest-list')).status,404);
    assert.equal((await api(worker,path+'/refund','POST',{orderId:order})).status,404);
    assert.equal((await api(worker,path+'/staff')).status,404);
    assert.equal((await api(worker,path+'/check-in','POST',scan)).status,200);
    assert.equal((await api(worker,path+'/check-in','POST',scan)).status,409);
    assert.equal((await api(provider,path+'/staff','DELETE',{userId:worker.userId})).status,200);
    assert.equal((await api(worker,path+'/check-in','POST',scan)).status,404);
    assert.equal((await pool.query('SELECT checked_in_by FROM ticket_orders WHERE id=$1',[order])).rows[0].checked_in_by,worker.userId);
    assert.equal((await pool.query('SELECT id FROM event_staff_changes WHERE event_id=$1',[eid])).rowCount,2);
    const guestList=await api(provider,path+'/guest-list');
    assert.equal(guestList.data.totals.issued,1);
    assert.equal(guestList.data.totals.net_cents,'10750');
    assert.equal((await api(customer,path+'/refund','POST',{orderId:order})).status,404);
    assert.equal((await api(provider,path+'/refund','POST',{orderId:order})).status,200);
    assert.equal(await webhook('charge.refunded',{id:'ch_ticket',currency:'usd',amount:10750,amount_refunded:10750,payment_intent:paymentIntent,metadata}),200);
    assert.equal((await api(customer,'events?event='+eid)).data.events[0].ticket_state,'refunded');
   });
  } finally {await new Promise(resolve=>server.close(resolve));}
 });
}
