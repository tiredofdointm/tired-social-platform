import Stripe from 'stripe';
import {testPayments} from '../../server/ticket-checkout.mjs';
import assert from 'node:assert/strict';
import {createServer} from '../../server.mjs';
import {authRepository,createAuthHandler,SESSION_COOKIE} from '../../server/auth.mjs';
import {createSocialHandler} from '../../server/social-http.mjs';
export async function socialHttpChecks(t,pool){
 await t.test('shared HTTP journey persists two accounts and enforces ownership, privacy and CSRF',async()=>{
  const config={origin:'https://social.example.test'};
  const identities=authRepository(pool);
  const alice=await identities.signIn({issuer:'social-test',subject:'alice',name:'Alice'});
  const bob=await identities.signIn({issuer:'social-test',subject:'bob',name:'Bob'});
  const secret='whsec_local_fixture';
  const payments=testPayments({STRIPE_TEST_SECRET_KEY:'sk_test_fixture',STRIPE_TEST_WEBHOOK_SECRET:secret});
  let created;
  const refundRequests=new Map();
  payments.refunds={create:async (params,{idempotencyKey})=>{
   const original=refundRequests.get(idempotencyKey);
   if(original)assert.deepEqual(params,original);
   refundRequests.set(idempotencyKey,params);
   return {status:'succeeded'};
  }};
  payments.sessions={
   create:async params=>{
    created={id:'cs_test_'+params.metadata.tired_ticket_order,metadata:params.metadata,livemode:false,status:'open',url:'https://checkout.stripe.com/c/pay/test'};
    assert.equal(params.payment_method_types,undefined);
    assert.deepEqual(params.metadata,params.payment_intent_data.metadata);
    assert.equal(params.line_items[0].price_data.unit_amount,1500);
    return created;
   },
   retrieve:async id=>{assert.equal(created.id,id);return created;}
  };
  let sandboxEnabled=true;
  let connectAccounts=0;
  let bookingCheckoutSession,bookingSessions=0;
  let payoutsEnabled=true;
  let bookingRefundArguments=[];
  let bookingStripeRefunded=0;
  let bookingTransferReversed=0;
  let bookingTransferDestination='acct_providerFixture';
  let bookingPayoutAvailable=false;
  const connect={
   balance:{retrieve:async (params,scope)=>{
    assert.deepEqual(scope,{stripeAccount:'acct_providerFixture'});
    return {livemode:false,pending:[{currency:'usd',amount:10000},{currency:'eur',amount:900}],available:[]};
   }},
   payouts:{list:async (params,scope)=>{
    assert.deepEqual(params,{limit:5});
    assert.deepEqual(scope,{stripeAccount:'acct_providerFixture'});
    const base={livemode:false,type:'bank_account',currency:'usd',status:'paid',
     automatic:true,reconciliation_status:'completed',amount:10000,arrival_date:1800000000};
    if(bookingPayoutAvailable)return {data:[{...base,id:'po_booking',amount:13506}]};
    return {data:[{...base,id:'po_match',balance_transaction:'txn_payout'},
     {...base,id:'po_diff',amount:10500},{...base,id:'po_manual',automatic:false},
     {...base,id:'po_pending',status:'pending'},{...base,id:'po_more'}]};
   }},
   balanceTransactions:{list:async ({payout,limit,starting_after},scope)=>{
    assert.equal(limit,100);
    assert.deepEqual(scope,{stripeAccount:'acct_providerFixture'});
    if(payout==='po_booking')return {has_more:false,data:[
     {id:'txn_book',source:'py_bookingFixture',currency:'usd',net:12506},
     {id:'txn_other',source:'py_other',currency:'usd',net:1000}
    ]};
    assert.ok(['po_match','po_diff','po_more'].includes(payout));
    if(starting_after){
     assert.equal(payout,'po_more');
     assert.equal(starting_after,'txn_reversal');
     return {has_more:false,data:[{id:'txn_extra',currency:'usd',net:0}]};
    }
    return {has_more:payout==='po_more',data:[{id:'txn_payout',source:'po_match',currency:'usd',net:-10000},
     {id:'txn_first',currency:'usd',net:12000},{id:'txn_reversal',currency:'usd',net:-2000}]
     .filter(entry=>payout==='po_match'||entry.id!=='txn_payout')};
   }},
   refunds:{create:async (params,options)=>{
    bookingRefundArguments.push({params,options});
    return {status:'succeeded'};
   }},
   paymentIntents:{retrieve:async (id,options)=>{
    assert.equal(id,'pi_booking_fixture');
    assert.deepEqual(options,{expand:['latest_charge']});
    return {livemode:false,status:'succeeded',currency:'usd',amount_received:13444,
     metadata:bookingCheckoutSession.metadata,
     latest_charge:{id:'ch_booking_fixture',livemode:false,paid:true,amount:13444,
      amount_refunded:bookingStripeRefunded,transfer:'tr_booking_fixture'}};
   }},
   transfers:{retrieve:async id=>{
    assert.equal(id,'tr_booking_fixture');
    return {livemode:false,currency:'usd',source_transaction:'ch_booking_fixture',
     destination:bookingTransferDestination,destination_payment:'py_bookingFixture',amount:12506,amount_reversed:bookingTransferReversed};
   }},
   accounts:{
    create:async (input,options)=>{
     assert.equal(input.capabilities.transfers.requested,true);
     assert.equal(options.idempotencyKey,'sandbox-provider-'+bob.userId);
     connectAccounts++;
     return {id:'acct_providerFixture'};
    },
    retrieve:async id=>{
     assert.equal(id,'acct_providerFixture');
     return {details_submitted:true,capabilities:{transfers:'active'},payouts_enabled:payoutsEnabled};
    }
   },
   checkout:{sessions:{
    create:async (input,options)=>{
     assert.deepEqual(input.line_items.map(item=>item.price_data.unit_amount),[12506,938]);
     assert.deepEqual(input.payment_intent_data.transfer_data,{destination:'acct_providerFixture',amount:12506});
     assert.equal(options.idempotencyKey,'booking-'+input.metadata.tired_booking);
     bookingSessions++;
     bookingCheckoutSession={id:'cs_test_'+input.metadata.tired_booking,metadata:input.metadata,
      status:'open',livemode:false,url:'https://checkout.stripe.com/c/pay/booking'};
     return bookingCheckoutSession;
    },
    retrieve:async id=>{
     assert.equal(id,bookingCheckoutSession.id);
     return bookingCheckoutSession;
    }
   }},
   accountLinks:{create:async input=>{
    assert.equal(input.account,'acct_providerFixture');
    assert.equal(input.return_url,config.origin+'/#talent');
    return {url:'https://connect.stripe.com/setup/test'};
   }}
  };
  const sandbox=createSocialHandler({config,pool,payments,connect,bookingFeeBps:750});
  const publicEvents=createSocialHandler({config,pool,payments:null,connect:null});
  const server=createServer({auth:createAuthHandler({config,pool,provider:{}}),
   social:(...args)=>(sandboxEnabled?sandbox:publicEvents)(...args)});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  async function request(account,path,method='GET',data,headers={}){
   const response=await fetch(base+'/api/v1/'+path,{method,headers:{cookie:account?`${SESSION_COOKIE}=${account.token}`:'',origin:config.origin,'x-csrf-token':account?.csrf??'','content-type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)});
   return {status:response.status,data:await response.json()};
  }
  try{
   for(const account of [alice,bob])account.csrf=(await request(account,'me')).data.csrfToken;
   assert.equal((await request(null,'feed')).status,401);
   const profile={handle:'social_alice',display_name:'Alice shared',bio:'Private bio',visibility:'private'};
   assert.equal((await request(alice,'me/profile','PATCH',profile)).status,200);
   assert.equal((await request(bob,'me/profile','PATCH',profile)).status,409);
   assert.equal((await request(bob,'me/profile','PATCH',{...profile,user_id:alice.userId})).status,400);
   assert.equal((await request(bob,'profiles/social_alice')).data.profile.bio,null);
   assert.equal((await request(alice,'posts','POST',{body:'Spoof',visibility:'public',author_id:bob.userId})).status,400);
   assert.equal((await request(alice,'posts','POST',{body:'No csrf',visibility:'public'},{'x-csrf-token':''})).status,403);
   assert.equal((await request(alice,'posts','POST',{body:'Wrong origin',visibility:'public'},{origin:'https://evil.test'})).status,403);
   assert.equal((await request(alice,'posts','POST',{body:'x'.repeat(17000),visibility:'public'})).status,413);
   const post=(await request(alice,'posts','POST',{body:'Shared persistent text <script>safe</script>',visibility:'followers'})).data.post;
   const privatePost=(await request(alice,'posts','POST',{body:'Only Alice',visibility:'private'})).data.post;
   assert.equal((await request(bob,`posts/${post.id}`)).status,404);
   assert.equal((await request(bob,`follows/${alice.userId}`,'PUT')).data.follow.status,'pending');
   assert.equal((await request(bob,`posts/${post.id}/comments`,'POST',{body:'Hidden?'})).status,404);
   assert.equal((await request(bob,`follows/${alice.userId}/accept`,'PUT')).status,404);
   assert.ok((await request(alice,'me/follow-requests')).data.requests.some(p=>p.id===bob.userId));
   assert.equal((await request(alice,`follows/${bob.userId}/accept`,'PUT')).status,200);
   assert.equal((await request(bob,'profiles/social_alice')).data.profile.bio,'Private bio');
   assert.equal((await request(bob,`posts/${post.id}`)).data.post.body,post.body);
   assert.equal((await request(bob,`posts/${privatePost.id}`)).status,404);
   assert.equal((await request(bob,`posts/${post.id}`,'PATCH',{body:'Stolen',visibility:'public'})).status,404);
   assert.equal((await request(bob,`posts/${post.id}`,'DELETE')).status,404);
   assert.equal((await request(bob,`posts/${post.id}/comments`,'POST',{body:'A shared comment'})).status,201);
   assert.equal((await request(alice,`posts/${post.id}/comments`)).data.comments[0].body,'A shared comment');
   await request(bob,`posts/${post.id}/reactions/like`,'PUT');await request(bob,`posts/${post.id}/reactions/like`,'PUT');
   const feed=(await request(bob,'feed?mode=following&limit=1')).data;assert.equal(feed.posts[0].id,post.id);assert.equal(feed.posts[0].likes,1);assert.equal('identity_subject' in feed.posts[0],false);
   assert.equal((await request(bob,'feed?mode=following&cursor='+encodeURIComponent(feed.nextCursor))).data.posts.length,0);
   assert.equal((await request(bob,'feed?cursor=invalid')).status,400);
   assert.equal((await request(bob,'feed?limit=999')).status,400);
   const ownPost=(await request(bob,'posts','POST',{body:'Newer public post',visibility:'public'})).data.post;
   const ranked=(await request(bob,'feed?mode=for-you&limit=1')).data;
   assert.equal(ranked.posts[0].id,post.id);
   assert.equal('feed_position' in ranked.posts[0],false);
   const nextRanked=(await request(bob,'feed?mode=for-you&cursor='+encodeURIComponent(ranked.nextCursor))).data;
   assert.ok(nextRanked.posts.some(p=>p.id===ownPost.id));
   assert.ok(!nextRanked.posts.some(p=>p.id===post.id||p.id===privatePost.id));
   const latest=(await request(bob,'feed?mode=latest')).data.posts;
   assert.ok(latest.findIndex(p=>p.id===ownPost.id)<latest.findIndex(p=>p.id===post.id));
   assert.equal((await request(bob,'feed?mode=following&cursor='+encodeURIComponent(ranked.nextCursor))).status,400);
   await pool.query("UPDATE posts SET created_at=created_at-interval '2 days' WHERE id=$1",[post.id]);
   const beyondBoost=(await request(bob,'feed?mode=for-you')).data.posts;
   assert.ok(beyondBoost.findIndex(p=>p.id===ownPost.id)<beyondBoost.findIndex(p=>p.id===post.id));
   assert.equal((await request(bob,'posts/'+ownPost.id,'DELETE')).status,200);
   assert.equal((await request(alice,`blocks/${bob.userId}`,'PUT')).status,200);
   assert.ok((await request(alice,'blocks')).data.accounts.some(p=>p.id===bob.userId));
   assert.equal((await request(bob,'blocks')).data.accounts.length,0);
   assert.equal((await request(bob,`posts/${post.id}/comments`)).status,404);
   assert.equal((await request(bob,`follows/${alice.userId}`,'PUT')).status,404);
   assert.equal((await request(bob,'profiles/social_alice')).status,404);
   assert.equal((await request(alice,`posts/${post.id}/comments`)).data.comments.length,0);
   assert.equal((await request(bob,'feed?mode=following')).data.posts.length,0);
   assert.ok(!(await request(bob,'feed?mode=for-you')).data.posts.some(p=>p.author_id===alice.userId));
   await request(alice,`blocks/${bob.userId}`,'DELETE');
   assert.equal((await request(bob,`posts/${post.id}`)).status,404,'unblocking never restores accepted follow');
   assert.equal((await request(alice,`posts/${post.id}`,'PATCH',{body:'Now public',visibility:'public'})).status,200);
   assert.equal((await request(bob,`posts/${post.id}`)).data.post.body,'Now public');
   await request(alice,`posts/${post.id}`,'DELETE');assert.equal((await request(alice,`posts/${post.id}`)).status,404);
   const startsAt=new Date(Date.now()+86400000).toISOString();
   const event=await request(alice,'events','POST',{title:'Shared show',venue:'Main Hall',capacity:1,startsAt});
   assert.equal(event.status,201);
   assert.equal(event.data.publication,'published');
   const ticketEvent={title:'Ticket test',venue:'Main Hall',capacity:1,startsAt,ticketPriceCents:1500};
   assert.equal((await request(alice,'events','POST',{...ticketEvent,ticketPriceCents:0})).status,400);
   const paid=await request(alice,'events','POST',ticketEvent);
   assert.equal(paid.status,201);
   const ticketPath='events/'+paid.data.id;
   const holdPath=ticketPath+'/ticket-hold';
   assert.equal((await request(null,holdPath,'PUT')).status,401);
   assert.equal((await request(bob,holdPath,'PUT',undefined,{'x-csrf-token':''})).status,403);
   assert.equal((await request(bob,ticketPath+'/rsvp','PUT')).status,404);
   const buyers=[alice,bob];
   const holds=await Promise.all(buyers.map(buyer=>request(buyer,holdPath,'PUT')));
   assert.deepEqual(holds.map(result=>result.status).sort(),[200,409]);
   const heldBy=holds.findIndex(result=>result.status===200);
   const sameHold=await request(buyers[heldBy],holdPath,'PUT');
   assert.equal(sameHold.data.expiresAt,holds[heldBy].data.expiresAt);
   const waitingBuyer=buyers[1-heldBy];
   await request(waitingBuyer,holdPath,'DELETE');
   assert.equal((await request(waitingBuyer,holdPath,'PUT')).status,409);
   await pool.query("UPDATE ticket_holds SET expires_at=now()-interval '1 second' WHERE event_id=$1",[paid.data.id]);
   assert.equal((await request(waitingBuyer,holdPath,'PUT')).status,200);
   const ticketList=(await request(waitingBuyer,'events')).data.events.find(row=>row.id===paid.data.id);
   assert.equal(ticketList.held,1);
   assert.ok(ticketList.my_hold_until);
   assert.equal((await request(waitingBuyer,holdPath,'DELETE')).status,200);
   assert.equal((await request(buyers[heldBy],holdPath,'PUT')).status,200);
   const checkoutPath=ticketPath+'/checkout';
   const buyer=buyers[heldBy];
   sandboxEnabled=false;
   const publicList=(await request(buyer,'events')).data;
   assert.equal(publicList.checkoutEnabled,false);
   assert.ok(!publicList.events.some(row=>row.id===paid.data.id));
   assert.ok(publicList.events.some(row=>row.id===event.data.id));
   assert.equal((await request(alice,'events','POST',ticketEvent)).status,503);
   assert.equal((await request(buyer,holdPath,'PUT')).status,503);
   assert.equal((await request(buyer,checkoutPath,'POST')).status,503);
   sandboxEnabled=true;
   assert.equal((await request(waitingBuyer,checkoutPath,'POST')).status,409);
   assert.equal((await request(buyer,checkoutPath,'POST')).status,200);
   assert.equal((await request(buyer,checkoutPath,'POST')).status,200);
   assert.equal((await request(waitingBuyer,holdPath,'PUT')).status,409);
   async function notify(type,object,valid=true){
    const payload=JSON.stringify({type,livemode:false,data:{object}});
    const signature=Stripe.webhooks.generateTestHeaderString({payload,secret:valid?secret:'whsec_wrong'});
    return (await fetch(base+'/api/v1/ticket-webhook',{method:'POST',headers:{'stripe-signature':signature},body:payload})).status;
   }
   const payment=()=>({...created,mode:'payment',payment_status:'paid',amount_total:1500,currency:'usd',payment_intent:'pi_'+created.id});
   const charge=()=>({...payment(),amount:1500,amount_refunded:1500});
   const state=async()=>(await request(buyer,'events')).data.events.find(row=>row.id===paid.data.id).ticket_state;
   assert.equal(await notify('checkout.session.completed',payment(),false),400);
   assert.equal(await state(),'open');
   assert.equal(await notify('checkout.session.completed',{...payment(),payment_status:'unpaid'}),200);
   assert.equal(await state(),'open');
   for(let i=0;i<2;i++)assert.equal(await notify('checkout.session.async_payment_succeeded',payment()),200);
   assert.equal(await state(),'issued');
   const paidFriends=async()=> (await request(waitingBuyer,'events')).data.events.find(e=>e.id===paid.data.id).attending_friends;
   const ticketHolder=(await request(buyer,'me')).data.user;
   const ticketProfile={handle:ticketHolder.handle,display_name:ticketHolder.display_name,bio:ticketHolder.bio??'',visibility:ticketHolder.visibility};
   await request(alice,'follows/'+bob.userId,'PUT');
   await request(bob,'follows/'+alice.userId,'PUT');
   await request(alice,'follows/'+bob.userId+'/accept','PUT');
   assert.deepEqual(await paidFriends(),[]);
   await request(buyer,'me/profile','PATCH',{...ticketProfile,shareEventAttendance:true});
   assert.deepEqual(await paidFriends(),[ticketHolder.handle]);
   const guestList=ticketPath+'/guest-list';
   const checkIn=ticketPath+'/check-in';
   const ticketCode=(await request(buyer,'events')).data.events.find(row=>row.id===paid.data.id).my_ticket_code;
   assert.ok(ticketCode);
   assert.equal((await request(waitingBuyer,'events')).data.events.find(row=>row.id===paid.data.id).my_ticket_code,null);
   assert.equal((await request(bob,guestList)).status,404);
   assert.equal((await request(bob,checkIn,'POST',{code:ticketCode})).status,404);
   assert.equal((await request(alice,checkIn,'POST',{code:ticketCode},{'x-csrf-token':''})).status,403);
   const checkInResults=await Promise.all([request(alice,checkIn,'POST',{code:ticketCode}),request(alice,checkIn,'POST',{code:ticketCode})]);
   assert.deepEqual(checkInResults.map(result=>result.status).sort(),[200,409]);
   const admitted=(await request(alice,guestList)).data;
   assert.deepEqual(admitted.totals,{issued:1,checked_in:1,net_cents:'1500'});
   assert.ok(admitted.guests[0].checked_in_at);
   assert.ok(!('id' in admitted.guests[0]));
   const refundPath=ticketPath+'/refund';
   const orderId=admitted.guests[0].order_id;
   assert.notEqual(orderId,ticketCode);
   assert.equal((await request(alice,checkIn,'POST',{code:orderId})).status,404);
   assert.equal((await request(bob,refundPath,'POST',{orderId})).status,404);
   assert.equal((await request(alice,refundPath,'POST',{orderId},{'x-csrf-token':''})).status,403);


   assert.equal(await notify('charge.refunded',{...charge(),amount_refunded:500}),200);
   assert.equal(await state(),'issued');
   assert.equal((await request(alice,refundPath,'POST',{orderId})).data.status,'succeeded');
   assert.equal((await request(alice,refundPath,'POST',{orderId})).data.status,'succeeded');
   assert.deepEqual([...refundRequests.values()],[{payment_intent:payment().payment_intent}]);
   assert.equal(await state(),'issued');
   assert.equal(await notify('charge.refunded',charge()),200);
   assert.equal(await notify('checkout.session.completed',payment()),200);
   assert.equal(await state(),'refunded');
   assert.deepEqual(await paidFriends(),[]);
   await request(buyer,'me/profile','PATCH',{...ticketProfile,shareEventAttendance:false});
   await request(alice,'follows/'+bob.userId,'DELETE');
   await request(bob,'follows/'+alice.userId,'DELETE');
   assert.equal((await request(alice,refundPath,'POST',{orderId})).data.status,'refunded');
   assert.equal((await request(alice,checkIn,'POST',{code:ticketCode})).status,404);
   assert.deepEqual((await request(alice,guestList)).data,{guests:[],totals:{issued:0,checked_in:0,net_cents:'0'}});

   assert.equal((await request(waitingBuyer,holdPath,'PUT')).status,200);
   assert.equal((await request(waitingBuyer,checkoutPath,'POST')).status,200);
   assert.equal(await notify('charge.refunded',charge()),200);
   assert.equal(await notify('checkout.session.completed',payment()),200);
   assert.equal((await request(buyer,holdPath,'PUT')).status,200);
   assert.equal((await request(buyer,checkoutPath,'POST')).status,200);
   assert.equal(await notify('checkout.session.async_payment_failed',created),200);
   assert.equal((await request(buyer,holdPath,'PUT')).status,200);
   assert.equal((await request(buyer,checkoutPath,'POST')).status,200);
   assert.equal(await notify('checkout.session.expired',created),200);
   assert.equal((await request(waitingBuyer,holdPath,'PUT')).status,200);
   assert.equal((await request(bob,'events/publishing','PUT',{manualReview:true})).status,403);
   await pool.query('INSERT INTO publishing_admins(user_id) VALUES($1)',[alice.userId]);
   assert.equal((await request(alice,'events/publishing','PUT',{manualReview:true})).status,200);
   const pendingEvent=(await request(bob,'events','POST',{title:'Review show',venue:'Main Hall',capacity:2,startsAt})).data;
   assert.equal(pendingEvent.publication,'pending');
   assert.equal((await request(alice,'events?event=invalid')).status,400);
   assert.ok(!(await request(alice,'events?event='+pendingEvent.id)).data.events.some(row=>row.id===pendingEvent.id));

   assert.equal((await request(bob,'events/'+pendingEvent.id+'/rsvp','PUT')).status,404);
   const reviewPath='events/'+pendingEvent.id+'/review';
   assert.equal((await request(bob,reviewPath,'PUT',{decision:'published'})).status,404);
   assert.ok((await request(alice,'events/publishing')).data.submissions.some(row=>row.id===pendingEvent.id));
   assert.equal((await request(alice,reviewPath,'PUT',{decision:'published'})).status,200);
   assert.equal((await request(alice,reviewPath,'PUT',{decision:'rejected'})).status,404);
   assert.equal((await request(alice,'events/publishing','PUT',{manualReview:false})).status,200);
   const service = {title:'Event photography',category:'Photography',description:'Two photographers for the evening.'};
   assert.equal((await request(null,'services')).status,401);
   assert.equal((await request(bob,'services','POST',{...service, owner_id:alice.userId})).status,400);
   assert.equal((await request(bob,'services','POST',{...service, category:'Incorrect'})).status,400);
   assert.equal((await request(bob,'services','POST',service,{'x-csrf-token':''})).status,403);
   const published = await request(bob,'services','POST',service);
   assert.equal((await request(null,'services/connect')).status,401);
   assert.equal((await request(bob,'services/connect','POST',undefined,{'x-csrf-token':''})).status,403);
   assert.equal((await request(alice,'services/connect','POST')).data.eligible,false);
   assert.equal((await request(bob,'services/connect')).data.connected,false);
   const links=await Promise.all([request(bob,'services/connect','POST'),request(bob,'services/connect','POST')]);
   assert.ok(links.every(result=>result.status===200 && result.data.url==='https://connect.stripe.com/setup/test'));
   assert.equal(connectAccounts,1);
   assert.equal((await request(null,'services/connect/payouts')).status,401);
   assert.equal((await request(alice,'services/connect/payouts')).status,404);
   const {payouts:report,balance}= (await request(bob,'services/connect/payouts')).data;
   assert.deepEqual(balance,{availableCents:0,pendingCents:10000});
   assert.deepEqual(report.map(item=>item.reconciliation),['matched','mismatch','unsupported','pending','matched']);
   assert.equal(report[0].fundingCents,10000);
   assert.equal(report[0].entries,2);
   assert.equal(report[4].fundingCents,10000);
   assert.equal(report[4].entries,3);
   sandboxEnabled=false;
   assert.equal((await request(bob,'services/connect/payouts')).status,503);
   sandboxEnabled=true;

   assert.deepEqual((await request(bob,'services/connect')).data,
    {enabled:true,eligible:true,connected:true,detailsSubmitted:true,transfersEnabled:true,payoutsEnabled:true});
   sandboxEnabled=false;
   assert.deepEqual((await request(bob,'services/connect')).data,{enabled:false});
   sandboxEnabled=true;

   assert.equal(published.status,201);
   assert.equal(published.data.publication,'published');
   assert.ok((await request(alice,'services')).data.listings.some(row=>row.id===published.data.id));
   assert.equal((await request(alice,'services/'+published.data.id,'DELETE')).status,404);
   assert.equal((await request(bob,'services/publishing','PUT',{manualReview:true})).status,403);
   assert.equal((await request(alice,'services/publishing','PUT',{manualReview:true})).status,200);
   assert.equal((await request(alice,'events/publishing')).data.manual_review,false);
   const submitted = await request(bob,'services','POST',{...service,title:'Pending provider'});
   assert.equal(submitted.status,201);
   assert.equal(submitted.data.publication,'pending');
   assert.ok(!(await request(alice,'services')).data.listings.some(row=>row.id===submitted.data.id));
   assert.ok((await request(bob,'services/publishing')).data.mine.some(row=>row.id===submitted.data.id));
   assert.deepEqual((await request(bob,'services/publishing')).data.pending,[]);
   assert.ok((await request(alice,'services/publishing')).data.pending.some(row=>row.id===submitted.data.id));
   const serviceReview = 'services/'+submitted.data.id+'/review';
   assert.equal((await request(bob,serviceReview,'PUT',{decision:'published'})).status,404);
   const serviceReviews = await Promise.all([
    request(alice,serviceReview,'PUT',{decision:'published'}),
    request(alice,serviceReview,'PUT',{decision:'published'}),
   ]);
   assert.deepEqual(serviceReviews.map(result=>result.status).sort(),[200,404]);
   assert.ok((await request(alice,'services')).data.listings.some(row=>row.id===submitted.data.id));
   const carol=await identities.signIn({issuer:'booking-test',subject:'carol',name:'Carol'});
   carol.csrf=(await request(carol,'me')).data.csrfToken;
   const time={start:new Date(Math.ceil(Date.now()/3600000)*3600000+86400000).toISOString()};
   const availability='services/listings/'+submitted.data.id+'/availability';
   assert.equal((await request(alice,availability,'POST',time)).status,409);
   const slot=await request(bob,availability,'POST',time);
   assert.equal(slot.status,200);
   assert.equal((await request(bob,'services/listings/'+published.data.id+'/availability','POST',time)).status,409);
   const reserve='services/slots/'+slot.data.id+'/request';
   assert.equal((await request(bob,reserve,'POST')).status,409);
   const customers=[alice,carol];
   const attempts=await Promise.all(customers.map(user=>request(user,reserve,'POST')));
   assert.deepEqual(attempts.map(item=>item.status).sort(),[200,409]);
   const bookingWinner=attempts.findIndex(item=>item.status===200);
   const booking='services/bookings/'+attempts[bookingWinner].data.request_id;
   assert.equal((await request(customers[1-bookingWinner],'services/bookings')).data.bookings.length,0);
   assert.equal((await request(customers[1-bookingWinner],booking+'/cancel','POST')).status,409);
   assert.equal((await request(customers[bookingWinner],booking+'/confirm','POST')).status,409);
   const price={servicePriceCents:12506};
   assert.equal((await request(bob,booking+'/confirm','POST',{servicePriceCents:1})).status,400);
   sandboxEnabled=false;
   assert.equal((await request(bob,booking+'/confirm','POST',price)).status,503);
   sandboxEnabled=true;
   assert.equal((await request(bob,booking+'/confirm','POST',price)).status,200);
   assert.equal((await request(bob,booking+'/confirm','POST',price)).status,200);
   assert.equal((await request(bob,booking+'/confirm','POST',{servicePriceCents:20000})).status,409);
   assert.deepEqual((await request(customers[bookingWinner],'services/bookings')).data.bookings[0].quote,
    {serviceCents:12506,feeCents:938,totalCents:13444});
   sandboxEnabled=false;
   assert.equal((await request(customers[bookingWinner],'services/bookings')).data.bookings[0].quote,null);
   sandboxEnabled=true;
   assert.equal((await request(customers[bookingWinner],'services/bookings')).data.bookings[0].confirmed,true);
   const buyerAccount=customers[bookingWinner];
   const bookingCheckout=booking+'/checkout';
   assert.equal((await request(bob,bookingCheckout,'POST')).status,404);
   assert.equal((await request(customers[1-bookingWinner],bookingCheckout,'POST')).status,404);
   payoutsEnabled=false;
   assert.equal((await request(buyerAccount,bookingCheckout,'POST')).data.error.code,'provider_payouts_pending');
   payoutsEnabled=true;
   const opens=await Promise.all([request(buyerAccount,bookingCheckout,'POST'),request(buyerAccount,bookingCheckout,'POST')]);
   assert.ok(opens.every(open=>open.status===200&&open.data.url==='https://checkout.stripe.com/c/pay/booking'));
   assert.equal(bookingSessions,1);
   assert.equal((await request(buyerAccount,booking+'/cancel','POST')).status,409);
   const bookingPaid={...bookingCheckoutSession,mode:'payment',currency:'usd',amount_total:13444,
    payment_status:'paid',payment_intent:'pi_booking_fixture'};
   const bookingState=async()=>(await request(buyerAccount,'services/bookings')).data.bookings[0].payment_state;
   assert.equal(await notify('checkout.session.completed',{...bookingPaid,amount_total:100}),409);
   assert.equal(await notify('checkout.session.completed',bookingPaid,false),400);
   assert.equal(await bookingState(),'open');
   assert.equal(await notify('checkout.session.completed',bookingPaid),200);
   assert.equal(await notify('checkout.session.completed',bookingPaid),200);
   assert.equal(await bookingState(),'paid');
   const bookingTransfer=booking+'/transfer';
   const bookingRefund=booking+'/refund';
   const payoutPath=booking+'/payout';
   assert.equal((await request(null,payoutPath)).status,401);
   assert.equal((await request(buyerAccount,payoutPath)).status,404);
   assert.equal((await request(customers[1-bookingWinner],payoutPath)).status,404);
   assert.equal((await request(bob,payoutPath,'POST')).status,405);
   assert.deepEqual((await request(bob,payoutPath)).data,{status:'unverified',payoutsChecked:5});
   bookingPayoutAvailable=true;
   assert.deepEqual((await request(bob,payoutPath)).data,{status:'matched',contributionCents:12506,payoutCents:13506});
   const paymentList=(await request(bob,'services/connect/payouts')).data.bookings;
   assert.equal(paymentList.length,1);
   assert.equal(paymentList[0].id,attempts[bookingWinner].data.request_id);
   assert.equal(paymentList[0].serviceCents,12506);
   sandboxEnabled=false;
   assert.equal((await request(bob,payoutPath)).status,503);
   sandboxEnabled=true;

   assert.equal((await request(buyerAccount,bookingTransfer)).status,404);
   assert.equal((await request(buyerAccount,bookingRefund,'POST')).status,404);
   assert.equal((await request(bob,bookingRefund,'POST',undefined,{'x-csrf-token':''})).status,403);
   assert.deepEqual((await request(bob,bookingTransfer)).data,
    {currency:'usd',chargedCents:13444,refundedCents:0,transferredCents:12506,reversedCents:0});
   bookingTransferDestination='acct_other';
   assert.equal((await request(bob,payoutPath)).data.error.code,'booking_transfer_mismatch');
   assert.equal((await request(bob,bookingTransfer)).data.error.code,'booking_transfer_mismatch');
   bookingTransferDestination='acct_providerFixture';
   for(let i=0;i<2;i++)assert.equal((await request(bob,bookingRefund,'POST')).data.status,'succeeded');
   assert.deepEqual(bookingRefundArguments,Array(2).fill({
    params:{payment_intent:'pi_booking_fixture',reverse_transfer:true},
    options:{idempotencyKey:'booking-full-refund-'+attempts[bookingWinner].data.request_id}
   }));

   assert.equal(await notify('charge.refunded',{...bookingPaid,amount:13444,amount_refunded:938}),200);
   assert.equal((await request(buyerAccount,booking+'/cancel','POST')).status,409);
   assert.equal(await notify('charge.refunded',{...bookingPaid,amount:13444,amount_refunded:13444}),200);
   assert.equal(await bookingState(),'refunded');
   bookingStripeRefunded=13444;
   bookingTransferReversed=12506;
   assert.deepEqual((await request(bob,payoutPath)).data,{status:'adjusted'});
   assert.deepEqual((await request(bob,'services/connect/payouts')).data.bookings,[]);
   assert.equal((await request(bob,bookingRefund,'POST')).data.status,'refunded');
   assert.deepEqual((await request(bob,bookingTransfer)).data,
    {currency:'usd',chargedCents:13444,refundedCents:13444,transferredCents:12506,reversedCents:12506});

   assert.equal((await request(bob,'services/'+submitted.data.id,'DELETE')).status,409);
   assert.equal((await request(customers[bookingWinner],booking+'/cancel','POST')).status,200);
   const recycled=await request(customers[1-bookingWinner],reserve,'POST');
   assert.equal(recycled.status,200);
   assert.equal((await request(bob,'services/bookings')).data.bookings[0].quote,null);
   const recycledPath='services/bookings/'+recycled.data.request_id;
   assert.equal((await request(bob,recycledPath+'/confirm','POST',price)).status,200);
   assert.equal((await request(customers[1-bookingWinner],recycledPath+'/checkout','POST')).status,200);
   assert.equal(await notify('checkout.session.expired',bookingCheckoutSession),200);

   assert.equal((await request(customers[1-bookingWinner],'services/bookings/'+recycled.data.request_id+'/cancel','POST')).status,200);
   assert.equal((await request(bob,'services/slots/'+slot.data.id+'/remove','POST')).status,200);
   const rejected = await request(bob,'services','POST',{...service,title:'Another submission'});
   assert.equal((await request(alice,'services/'+rejected.data.id+'/review','PUT',{decision:'rejected'})).status,200);
   assert.ok(!(await request(alice,'services')).data.listings.some(row=>row.id===rejected.data.id));
   await request(alice,`blocks/${bob.userId}`,'PUT');
   assert.deepEqual((await request(alice,'services')).data.listings,[]);
   await request(alice,`blocks/${bob.userId}`,'DELETE');
   assert.equal((await request(bob,'services/'+submitted.data.id,'DELETE')).status,200);
   assert.ok(!(await request(alice,'services')).data.listings.some(row=>row.id===submitted.data.id));
   assert.equal((await request(alice,'services/publishing','PUT',{manualReview:false})).status,200);
   const rsvp='events/'+event.data.id+'/rsvp';
   const results=await Promise.all([request(alice,rsvp,'PUT'),request(bob,rsvp,'PUT')]);
   assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
   const winner=results[0].status===200?alice:bob;
   const other=winner===alice?bob:alice;
   assert.equal((await request(winner,rsvp,'PUT')).status,200);
   assert.equal((await request(winner,'events')).data.events.find(row=>row.id===event.data.id).attending,1);
   assert.equal((await request(winner,rsvp,'DELETE')).status,200);
   assert.equal((await request(other,rsvp,'PUT')).status,200);
   // Use a separate event so the organizer can see the RSVP without relying on who won the capacity race.
   const meetup=(await request(alice,'events','POST',{title:'Friends meetup',venue:'Hall',capacity:4,startsAt})).data;
   await request(bob,'events/'+meetup.id+'/rsvp','PUT');
   const friendsGoing=async()=> (await request(alice,'events')).data.events.find(e=>e.id===meetup.id)?.attending_friends;
   const bobProfile=(await request(bob,'me')).data.user;
   const bobEdits={handle:bobProfile.handle,display_name:bobProfile.display_name,bio:bobProfile.bio??'',visibility:bobProfile.visibility};
   assert.equal(bobProfile.share_event_attendance,false);
   await request(alice,'follows/'+bob.userId,'PUT');
   assert.deepEqual(await friendsGoing(),[]);
   assert.equal((await request(bob,'me/profile','PATCH',{...bobEdits,shareEventAttendance:true})).status,200);
   assert.deepEqual(await friendsGoing(),[]);
   await request(bob,'follows/'+alice.userId,'PUT');
   await request(alice,'follows/'+bob.userId+'/accept','PUT');
   assert.deepEqual(await friendsGoing(),[bobProfile.handle]);
   await request(bob,'me/profile','PATCH',bobEdits);
   assert.deepEqual(await friendsGoing(),[bobProfile.handle]);
   await request(bob,'me/profile','PATCH',{...bobEdits,shareEventAttendance:false});
   assert.deepEqual(await friendsGoing(),[]);
   await request(bob,'me/profile','PATCH',{...bobEdits,shareEventAttendance:true});
   await request(bob,'events/'+meetup.id+'/rsvp','DELETE');
   assert.deepEqual(await friendsGoing(),[]);
   await request(bob,'events/'+meetup.id+'/rsvp','PUT');
   await request(alice,'blocks/'+bob.userId,'PUT');
   assert.deepEqual(await friendsGoing(),[]);
   await request(alice,'blocks/'+bob.userId,'DELETE');
   const plan=await request(alice,'plans','POST',{title:'Private meetup',details:'Private address',startsAt});
   assert.equal(plan.status,201);
   const planPath='plans/'+plan.data.id;
   assert.deepEqual((await request(bob,'plans')).data.plans,[]);
   assert.equal((await request(bob,planPath+'/membership','PUT')).status,404);
   assert.equal((await request(bob,planPath+'/invite','PUT',{handle:'social_alice'})).status,404);
   assert.equal((await request(alice,planPath+'/invite','PUT',{handle:bobProfile.handle})).status,200);
   const pending=(await request(bob,'plans')).data.plans[0];
   assert.equal(pending.details,null);
   assert.equal(pending.starts_at,null);
   assert.equal((await request(bob,planPath+'/membership','PUT')).status,200);
   assert.equal((await request(bob,'plans')).data.plans[0].details,'Private address');
   assert.equal((await request(bob,planPath+'/membership','DELETE')).status,200);
   assert.deepEqual((await request(bob,'plans')).data.plans,[]);
   await pool.query("UPDATE users SET status='suspended' WHERE id=$1",[bob.userId]);
   assert.equal((await request(bob,'posts','POST',{body:'Suspended',visibility:'public'})).status,401);
  }finally{await new Promise(resolve=>server.close(resolve));}
 });
}
