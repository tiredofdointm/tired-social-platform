import {liveRecords,sandboxRecords} from './live-booking-config.mjs';
import {reconcileBookingPayment} from './booking-payments.mjs';
import Stripe from 'stripe';
import {transaction} from './database.mjs';

export function testPayments(env=process.env){
 const key=env.STRIPE_TEST_SECRET_KEY, secret=env.STRIPE_TEST_WEBHOOK_SECRET;
 if(!key && !secret)return null;
 if(!key?.startsWith('sk_test_') || !secret?.startsWith('whsec_'))throw Error('Invalid test payment configuration');
 const stripe=new Stripe(key,{timeout:5000,maxNetworkRetries:0});
 return {sessions:stripe.checkout.sessions,refunds:stripe.refunds,verify:(raw,signature)=>stripe.webhooks.constructEvent(raw,signature,secret)};
}

export function ticketQuote(price,live){
 const feeCents=live?Math.floor((price*750+5000)/10000):0;
 return {ticketCents:price,feeCents,totalCents:price+feeCents};
}

export async function ticketDestination(db,payments,organizer,fail){
 const {rows:[seller]}=await db.query('SELECT stripe_account_id FROM live_provider_connect_accounts WHERE provider_id=$1',[organizer]);
 if(!seller)fail(409,'organizer_onboarding_required');
 const account=await payments.accounts.retrieve(seller.stripe_account_id);
 if(account.capabilities?.transfers!=='active'||account.payouts_enabled!==true)fail(409,'organizer_onboarding_required');
 return seller.stripe_account_id;
}

export async function checkout({db,actor,event,origin,payments,fail}){
 if(!payments)fail(503,'sandbox_checkout_unavailable');
 const live=payments.live===true;
 const existing=(await db.query("SELECT session_id,state FROM ticket_orders WHERE event_id=$1 AND buyer_id=$2 AND state IN ('issued','open')",[event.id,actor])).rows[0];
 let session;
 if(existing){
  if(existing.state==='issued')fail(409,'ticket_already_issued');
  session=await payments.sessions.retrieve(existing.session_id);
 }else{
  const hold=(await db.query('SELECT attempt_id,expires_at FROM ticket_holds WHERE event_id=$1 AND buyer_id=$2 AND expires_at>clock_timestamp() FOR UPDATE',[event.id,actor])).rows[0];
  if(!hold)fail(409,'reserve_a_ticket_first');
  const until=Math.min(+new Date(event.starts_at),+new Date(hold.expires_at)+31*60000);
  if(until-Date.now()<31*60000)fail(409,'checkout_closed');
  const quote=ticketQuote(event.ticket_price_cents,live);
  const metadata={tired_ticket_order:hold.attempt_id,...(live?{tired_platform:'tired.events'}:{})};
  const destination=live?await ticketDestination(db,payments,event.owner_id,fail):null;
  const items=[{name:event.title,cents:quote.ticketCents}];
  if(quote.feeCents)items.push({name:'Platform fee (7.5%)',cents:quote.feeCents});
  session=await payments.sessions.create({mode:'payment',adaptive_pricing:{enabled:false},metadata,
   payment_intent_data:{metadata,...(live?{transfer_data:{destination,amount:quote.ticketCents}}:{})},expires_at:Math.floor(until/1000),
   success_url:origin+'/#shared-events',cancel_url:origin+'/#shared-events',
   line_items:items.map(item=>({quantity:1,price_data:{currency:'usd',unit_amount:item.cents,product_data:{name:item.name}}}))
  },{idempotencyKey:(live?'ticket-live-':'ticket-dynamic-')+hold.attempt_id});
  if(session.livemode!==live || session.status!=='open')fail(409,'checkout_unavailable');
  await db.query('INSERT INTO ticket_orders(id,event_id,buyer_id,amount,session_id,organizer_amount,destination_account) VALUES($1,$2,$3,$4,$5,$6,$7)',[hold.attempt_id,event.id,actor,quote.totalCents,session.id,live?quote.ticketCents:null,destination??null]);
  await db.query('DELETE FROM ticket_holds WHERE attempt_id=$1',[hold.attempt_id]);
 }
 if(session.livemode!==live || session.status!=='open' || !session.url || new URL(session.url).origin!=='https://checkout.stripe.com')fail(409,'refresh_ticket_status');
 return {url:session.url};
}

export async function ticketWebhook({req,pool,payments,fail,liveWebhook=false,verifyLiveBooking=null}){
 if(req.method!=='POST')fail(405,'method_not_allowed');
 const verify=liveWebhook?verifyLiveBooking:payments?.verify;
 if(!verify)fail(503,liveWebhook?'live_bookings_unavailable':'sandbox_checkout_unavailable');
 let size=0;const chunks=[];
 for await(const chunk of req){size+=chunk.length;if(size>256*1024)fail(413,'body_too_large');chunks.push(chunk);}
 let event;
 try{event=verify(Buffer.concat(chunks),req.headers['stripe-signature']);}catch{fail(400,'invalid_signature');}
 if(event.livemode!==liveWebhook)fail(400,liveWebhook?'live_event_required':'test_event_required');
 if(liveWebhook&&(event.account||event.data.object.metadata?.tired_platform!=='tired.events'))return;
 if(event.data.object.metadata?.tired_booking){await reconcileBookingPayment({event,pool,fail,records:liveWebhook?liveRecords:sandboxRecords});return;}
 const release=['checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type);
 const paid=['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type);
 const refund=event.type==='charge.refunded';
 if(!release && !paid && !refund)return;
 const obj=event.data.object;
 const id=obj.metadata?.tired_ticket_order;
 if(!id || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))return;
 await transaction(pool,async db=>{
  const order=(await db.query('SELECT o.* FROM ticket_orders o JOIN events e ON e.id=o.event_id WHERE o.id=$1 AND e.live_ticket=$2 FOR UPDATE OF o',[id,liveWebhook])).rows[0];
  if(!order){if(release)return;fail(503,'order_unavailable');}
  if(liveWebhook && refund && !order.payment_id)fail(503,'await_ticket_payment_confirmation');
  if(release){
   if(obj.id===order.session_id)await db.query("UPDATE ticket_orders SET state='expired' WHERE id=$1 AND state='open'",[id]);
   return;
  }
  if(!refund && (obj.id!==order.session_id || obj.payment_status!=='paid' || obj.mode!=='payment'))return;
  if(obj.currency!=='usd' || (refund?obj.amount:obj.amount_total)!==order.amount || typeof obj.payment_intent!=='string' ||
     (order.payment_id && order.payment_id!==obj.payment_intent))fail(409,'payment_mismatch');
  if(refund){
   if(!Number.isInteger(obj.amount_refunded)||obj.amount_refunded<0||obj.amount_refunded>order.amount)fail(400,'invalid_refund');
   await db.query("UPDATE ticket_orders SET payment_id=$2,refunded=greatest(refunded,$3),state=CASE WHEN $3=amount THEN 'refunded' ELSE state END WHERE id=$1",[id,obj.payment_intent,obj.amount_refunded]);
  }else{
   await db.query("UPDATE ticket_orders SET payment_id=$2,state='issued' WHERE id=$1 AND state='open'",[id,obj.payment_intent]);
  }
 });
}
