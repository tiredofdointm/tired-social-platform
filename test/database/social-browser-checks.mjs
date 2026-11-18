import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {createServer} from '../../server.mjs';
import {authRepository,createAuthHandler,SESSION_COOKIE} from '../../server/auth.mjs';
import {createSocialHandler} from '../../server/social-http.mjs';
export async function socialBrowserChecks(t,pool){
 if(process.env.TEST_BROWSER!=='1')return;
 await t.test('two browser accounts share PostgreSQL posts, comments and profiles',async()=>{
  const config={origin:''},repo=authRepository(pool);
  const alice=await repo.signIn({issuer:'browser-test',subject:'alice',name:'Browser Alice'});
  const bob=await repo.signIn({issuer:'browser-test',subject:'bob',name:'Browser Bob'});
  let pending = 10000;
  let payoutPaid = false;
  let pastBooking;
  const connect = {
   accounts:{retrieve:async()=>({capabilities:{transfers:'active'},payouts_enabled:true,details_submitted:true})},
   balance:{retrieve:async()=>({livemode:false,pending:[{currency:'usd',amount:pending}],available:[{currency:'usd',amount:10000-pending}]})},
   payouts:{list:async()=>({data:payoutPaid ? [{id:'po_browser',livemode:false,automatic:true,type:'bank_account',
    currency:'usd',amount:12000,status:'paid',reconciliation_status:'completed',arrival_date:1800000000}] : []})},
   paymentIntents:{retrieve:async()=>({livemode:false,status:'succeeded',currency:'usd',amount_received:10750,
    metadata:{tired_booking:pastBooking},latest_charge:{id:'ch_browser',livemode:false,paid:true,amount:10750,transfer:'tr_browser',amount_refunded:0}})},
   transfers:{retrieve:async()=>({source_transaction:'ch_browser',currency:'usd',livemode:false,
    destination:'acct_browserProvider',destination_payment:'py_browser',amount:10000,amount_reversed:0})},
   balanceTransactions:{list:async()=>({has_more:false,data:[
    {id:'txn_service',source:'py_browser',currency:'usd',net:10000},{id:'txn_other',source:'py_other',currency:'usd',net:2000}
   ]})}
  };
  const server=createServer({auth:createAuthHandler({config,pool,provider:{}}),social:createSocialHandler({config,pool,connect,payments:{},bookingFeeBps:750})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try{
   browser=await chromium.launch({headless:true});
   // Google identities and Stripe responses are fixtures. HTTP requests and PostgreSQL are real.
   const a=await browser.newPage({extraHTTPHeaders:{cookie:`${SESSION_COOKIE}=${alice.token}`}});
   const b=await browser.newPage({extraHTTPHeaders:{cookie:`${SESSION_COOKIE}=${bob.token}`}});
   async function navigate(page, name){
    const menu=page.getByRole('button',{name:/^Pages /});
    if(await menu.isVisible() && await menu.getAttribute('aria-expanded')==='false') await menu.click();
    await page.getByRole('button',{name,exact:true}).click();
   }
   const errors=[];for(const page of [a,b])page.on('pageerror',e=>errors.push(e.message));
   await a.goto(config.origin+'/#community');await b.goto(config.origin+'/#community');
   await a.getByRole('heading',{name:'Your community',exact:true}).waitFor();
   await b.getByRole('heading',{name:'Your community',exact:true}).waitFor();
   if(!await a.getByLabel('Account bio',{exact:true}).isVisible())await a.getByText('Edit shared profile',{exact:true}).click();
   await a.getByLabel('Handle',{exact:true}).fill('browser_alice');
   await a.getByLabel('Account bio',{exact:true}).fill('Persisted shared profile');
   await a.getByRole('button',{name:'Save shared profile',exact:true}).click();
   await a.getByLabel('Shared post',{exact:true}).fill('Persistent browser community post <b>literal</b>');
   await a.getByRole('button',{name:'Publish post',exact:true}).click();
   await a.getByText('Persistent browser community post <b>literal</b>',{exact:true}).waitFor();
   await b.getByRole('button',{name:'Refresh community',exact:true}).click();
   const post=b.getByRole('article').filter({hasText:'Persistent browser community post <b>literal</b>'});
   await post.getByRole('button',{name:'View comments',exact:true}).click();
   assert.equal(await post.getByRole('button',{name:'Delete post',exact:true}).count(),0);
   await post.getByLabel('Shared comment',{exact:true}).fill('Bob comment survives reload');
   await post.getByRole('button',{name:'Publish comment',exact:true}).click();
   await post.getByText('Bob comment survives reload',{exact:false}).waitFor();
   await a.reload();
   const own=a.getByRole('article').filter({hasText:'Persistent browser community post <b>literal</b>'});
   await own.getByRole('button',{name:'View comments',exact:true}).click();
   await own.getByText('Bob comment survives reload',{exact:false}).waitFor();
   if(!await a.getByLabel('Account bio',{exact:true}).isVisible())await a.getByText('Edit shared profile',{exact:true}).click();
   assert.equal(await a.getByLabel('Account bio',{exact:true}).inputValue(),'Persisted shared profile');
   await a.getByLabel('Shared post',{exact:true}).fill('Alice browser private post');
   await a.getByLabel('Who can see this',{exact:true}).selectOption('private');
   await a.getByRole('button',{name:'Publish post',exact:true}).click();
   await a.getByText('Alice browser private post',{exact:true}).waitFor();
   await b.reload();await b.getByRole('heading',{name:'Your community',exact:true}).waitFor();
   assert.equal(await b.getByText('Alice browser private post',{exact:true}).count(),0);
   await b.getByLabel('Find account by handle',{exact:true}).fill('browser_alice');
   await b.getByRole('button',{name:'Find account',exact:true}).click();
   await b.getByRole('button',{name:'Follow',exact:true}).click();
   await b.getByRole('button',{name:'Unfollow',exact:true}).waitFor();
   await b.getByRole('button',{name:'Following accounts',exact:true}).click();
   await b.getByText('Persistent browser community post <b>literal</b>',{exact:true}).waitFor();
   await mkdir('artifacts',{recursive:true});
   await b.evaluate(()=>window.scrollTo(0,0));
   await b.screenshot({path:'artifacts/shared-desktop.png',fullPage:true});
   await b.setViewportSize({width:390,height:844});
   assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Shared community fits mobile');
   await b.evaluate(()=>window.scrollTo(0,0));
   await b.screenshot({path:'artifacts/shared-mobile.png',fullPage:true});
   const menu=b.getByRole('button',{name:'Pages Shared community',exact:true});
   await menu.focus();
   await menu.press('Enter');
   assert.equal(await menu.getAttribute('aria-expanded'),'true');
   const nav=b.getByRole('navigation',{name:'Main navigation'});
   assert.equal(await nav.getByRole('button').count(),8);
   await b.keyboard.press('Tab');
   await b.keyboard.press('Escape');
   assert.equal(await menu.getAttribute('aria-expanded'),'false');
   assert.equal(await menu.evaluate(element=>document.activeElement===element),true);
   await b.setViewportSize({width:320,height:780});
   assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Shared community fits 320px');
   for(const page of [a,b]){
    await navigate(page,'Shared events');
    await page.getByRole('heading',{name:'Upcoming events'}).waitFor();
   }
   await a.getByText('Create an event or plan',{exact:true}).click();
   const start=new Date(Date.now()+86400000);
   const local=new Date(start.getTime()-start.getTimezoneOffset()*60000).toISOString().slice(0,16);
   await a.getByLabel('Title',{exact:true}).fill('Browser concert ' + 'x'.repeat(95));
   await a.getByLabel('Start time in your local timezone').fill(local);
   await a.getByLabel('Venue',{exact:true}).fill('Concert Hall');
   await a.getByRole('button',{name:'Publish event'}).click();
   await a.getByText('Event published.',{exact:true}).waitFor();
   await b.getByRole('button',{name:'Refresh lists'}).click();
   const concert=b.getByRole('article').filter({hasText:'Browser concert'});
   await concert.getByRole('button',{name:'RSVP',exact:true}).click();
   await concert.getByRole('button',{name:'Cancel RSVP'}).waitFor();
   assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Shared events fit 320px with long titles');
   await b.screenshot({path:'artifacts/shared-events-mobile.png',fullPage:true});
   await b.reload();
   await concert.getByRole('button',{name:'Cancel RSVP'}).waitFor();
   await a.getByLabel('Title',{exact:true}).fill('One ticket show');
   await a.getByLabel('Start time in your local timezone').fill(local);
   await a.getByLabel('Venue',{exact:true}).fill('Concert Hall');
   await a.getByLabel('Capacity',{exact:true}).fill('1');
   await a.getByLabel('Test ticket price',{exact:false}).fill('15');
   await a.getByRole('button',{name:'Publish event'}).click();
   await a.getByRole('heading',{name:'One ticket show'}).waitFor();
   await b.getByRole('button',{name:'Refresh lists'}).click();
   const ticketCard=b.getByRole('article').filter({hasText:'One ticket show'});
   await ticketCard.getByRole('button',{name:'Hold one test ticket'}).click();
   await ticketCard.getByText(/0 available/).waitFor();
   await b.reload();
   await ticketCard.getByRole('button',{name:'Release hold'}).click();
   await ticketCard.getByText(/1 available/).waitFor();
   await pool.query(`INSERT INTO ticket_orders(id,event_id,buyer_id,amount,session_id,state)
    SELECT gen_random_uuid(),id,$1,1500,'cs_test_browser_check_in','issued'
    FROM events WHERE owner_id=$2 AND title='One ticket show'`,[bob.userId,alice.userId]);
   await b.getByRole('button',{name:'Refresh lists'}).click();
   await ticketCard.getByText('Your test ticket is confirmed.').waitFor();
   const admissionCode=await ticketCard.locator('code').innerText();
   assert.equal(await ticketCard.getByText('Guest list and check-in').count(),0);
   const organizerCard=a.getByRole('article').filter({hasText:'One ticket show'});
   await organizerCard.getByText('Guest list and check-in').click();
   await organizerCard.getByRole('button',{name:'Load guest list'}).click();
   await organizerCard.getByText(/0 of 1 guests checked in/).waitFor();
   await organizerCard.getByLabel('Guest ticket code').fill(admissionCode);
   await organizerCard.getByRole('button',{name:'Check in guest'}).click();
   await organizerCard.getByText(/1 of 1 guests checked in/).waitFor();
   await b.getByRole('button',{name:'Refresh lists'}).click();
   await ticketCard.getByText(/Checked in at/).waitFor();

   await a.getByLabel('Type',{exact:true}).selectOption('plans');
   await a.getByLabel('Title',{exact:true}).fill('Browser meetup');
   await a.getByLabel('Start time in your local timezone').fill(local);
   await a.getByLabel('Meetup details').fill('Meet at the west gate.');
   await a.getByRole('button',{name:'Create private plan'}).click();
   const plan=a.getByRole('article').filter({hasText:'Browser meetup'});
   const bobProfile=await repo.session(bob.token);
   await plan.getByLabel('Invite by handle').fill(bobProfile.handle);
   await plan.getByRole('button',{name:'Invite',exact:true}).click();
   await a.getByText('In-app invitation saved.',{exact:true}).waitFor();
   await b.getByRole('button',{name:'Refresh lists'}).click();
   const invite=b.getByRole('article').filter({hasText:'Browser meetup'});
   await invite.getByRole('button',{name:'Accept invitation'}).waitFor();
   assert.equal(await invite.getByText('Meet at the west gate.').count(),0);
   await invite.getByRole('button',{name:'Accept invitation'}).click();
   await invite.getByText('Meet at the west gate.').waitFor();
   await a.getByRole('button',{name:'Find talent',exact:true}).click();
   const listingForm = a.getByText('List your service',{exact:true});
   await listingForm.focus();
   await a.keyboard.press('Tab');
   await a.keyboard.press('Shift+Tab');
   assert.equal(await listingForm.evaluate(element=>getComputedStyle(element).outlineStyle),'solid');
   await listingForm.press('Enter');
   const serviceTitle = 'Photography ' + 'x'.repeat(100);
   await a.getByLabel('Service title',{exact:true}).fill(serviceTitle);
   await a.locator('select[name="category"]').selectOption('Photography');
   await a.getByLabel('Description',{exact:true}).fill('Photography for concerts and meetups.');
   await a.getByRole('button',{name:'Publish service',exact:true}).click();
   await a.getByText('Service published.',{exact:true}).waitFor();
   await pool.query("INSERT INTO provider_connect_accounts(provider_id,stripe_account_id) VALUES($1,'acct_browserProvider')",[alice.userId]);
   const historical=await pool.query(`INSERT INTO service_slots(listing_id,provider_id,starts_at,customer_id,request_id,
     confirmed,quoted_service_cents,quoted_fee_cents,payment_locked)
     SELECT id,$1,date_trunc('hour',now())-interval '3 days',$2,gen_random_uuid(),true,10000,750,true
     FROM service_listings WHERE owner_id=$1 AND title=$3 RETURNING request_id`,[alice.userId,bob.userId,serviceTitle]);
   pastBooking=historical.rows[0].request_id;
   await pool.query(`INSERT INTO booking_payments(request_id,destination_account,service_cents,fee_cents,
    expires_at,payment_id,state) VALUES($1,'acct_browserProvider',10000,750,now()-interval '3 days','pi_browser','paid')`,[pastBooking]);
   await a.reload();
   await a.getByText('Sandbox payouts',{exact:true}).click();
   await a.getByRole('button',{name:'Load payouts',exact:true}).click();
   const balances=a.locator('dl').filter({hasText:'Pending USD balance'});
   await balances.getByText('$100.00',{exact:true}).waitFor();
   assert.deepEqual(await balances.locator('dd').allTextContents(),['$100.00','$0.00']);
   await a.getByText('No payouts recorded in this sandbox account.',{exact:true}).waitFor();
   await a.getByRole('button',{name:'Check booking payout'}).click();
   await a.getByText('Stripe has no recorded payouts for this provider yet.').waitFor();
   assert.equal(await a.getByLabel('Paid booking',{exact:true}).inputValue(),pastBooking);
   pending=0;
   await a.getByRole('button',{name:'Refresh payouts',exact:true}).click();
   await balances.locator('dd').nth(1).filter({hasText:'$100.00'}).waitFor();
   assert.deepEqual(await balances.locator('dd').allTextContents(),['$0.00','$100.00']);
   payoutPaid=true;
   await a.getByRole('button',{name:'Check booking payout'}).click();
   await a.getByText('$100.00 from this booking was included in a paid $120.00 sandbox payout.').waitFor();
   await navigate(b,'Find talent');
   const service=b.getByRole('heading',{name:serviceTitle,exact:true});
   await service.waitFor();
   assert.match(await b.locator('.demo-banner').innerText(),/SHARED WORKSPACE/);
   assert.equal(await b.getByRole('button',{name:'+ Create',exact:true}).count(),0);
   assert.equal(await b.getByRole('searchbox').count(),1);
   for(const width of [320,390,768,1440]){
    await b.setViewportSize({width,height:850});
    assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),
      'Provider directory fits viewport width ' + width);
   }
   await b.screenshot({path:'artifacts/providers-desktop.png',fullPage:true});
   await b.setViewportSize({width:390,height:844});
   await b.screenshot({path:'artifacts/providers-mobile.png',fullPage:true});
   await b.getByLabel('Search services',{exact:true}).fill('lighting');
   await service.waitFor({state:'hidden'});
   await b.getByLabel('Search services',{exact:true}).fill('concerts');
   await service.waitFor();
   await b.getByText('1 service found.',{exact:true}).waitFor();
   assert.equal(await b.getByRole('button',{name:'Withdraw '+serviceTitle,exact:true}).count(),0);
   const providerCard=a.locator('.grid article').filter({hasText:serviceTitle});
   await providerCard.getByText('Availability',{exact:true}).click();
   const slotTime=new Date(Math.ceil(Date.now()/3600000)*3600000+86400000);
   await providerCard.getByLabel('One-hour start (UTC)').fill(slotTime.toISOString().slice(0,16));
   await providerCard.getByRole('button',{name:'Add time'}).click();
   await providerCard.getByRole('button',{name:'Remove time'}).waitFor();
   await b.reload();
   const customerCard=b.locator('.grid article').filter({hasText:serviceTitle});
   await customerCard.getByText('Availability',{exact:true}).click();
   await customerCard.getByRole('button',{name:'Request time'}).click();
   await b.getByText('Awaiting provider approval',{exact:true}).waitFor();
   await a.reload();
   await a.getByLabel('Sandbox service price').fill('100');
   await a.getByRole('button',{name:'Confirm request'}).click();
   await a.getByText('Confirmed',{exact:true}).waitFor();
   await b.reload();
   await b.getByText('Confirmed',{exact:true}).waitFor();
   await b.getByText('$7.50',{exact:true}).waitFor();
   await b.getByText('$107.50',{exact:true}).waitFor();
   await b.getByRole('button',{name:'Cancel booking'}).click();
   await b.getByRole('heading',{name:'Your bookings'}).waitFor({state:'hidden'});
   await navigate(b,'Shared community');
   await b.getByRole('button',{name:'Sign out',exact:true}).click();
   await b.getByRole('heading',{name:'Join your community',exact:true}).waitFor();
   assert.equal(await b.getByText('Persistent browser community post <b>literal</b>',{exact:true}).count(),0);
   assert.deepEqual(errors,[]);
  }catch(error){
   if(browser){await mkdir('artifacts',{recursive:true});let i=0;for(const context of browser.contexts())for(const page of context.pages()){
    await page.screenshot({path:`artifacts/shared-failure-${i++}.png`,fullPage:true});
    console.error(await page.locator('main').innerText());
   }}throw error;
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
 });
}
