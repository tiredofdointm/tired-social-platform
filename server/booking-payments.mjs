import {sandboxRecords} from './live-booking-config.mjs';
import {transaction} from './database.mjs';
import {recentPayouts, matchBookingPayout} from './payout-report.mjs';

const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

// Recover a live checkout when Stripe accepted the request but its response was lost.
async function findLiveSession(connect,payment,fail) {
 const created={gte:Math.floor(+new Date(payment.created_at)/1000)-60,lte:Math.ceil(+new Date(payment.expires_at)/1000)};
 let cursor;
 for(let page=0;page<10;page++){
  const sessions=await connect.checkout.sessions.list({limit:100,created,...(cursor?{starting_after:cursor}:{})});
  const match=sessions.data.find(session=>session.livemode===true&&session.client_reference_id===payment.request_id&&
    session.metadata?.tired_booking===payment.request_id&&session.metadata?.tired_platform==='tired.events');
  if(match)return match;
  if(!sessions.has_more)return null;
  cursor=sessions.data.at(-1)?.id;
  if(!cursor)break;
 }
 fail(503,'booking_checkout_reconciliation_pending');
}

export async function bookingCheckout({pool,connect,actor,id,origin,send,fail,records=sandboxRecords}){
 const booking=await transaction(pool,async db=>{
  const slot=(await db.query(`SELECT s.starts_at,s.quoted_service_cents,s.quoted_fee_cents,c.stripe_account_id
   FROM service_slots s JOIN ${records.accounts} c ON c.provider_id=s.provider_id
   JOIN users u ON u.id=s.provider_id AND u.status='active'
   WHERE s.request_id=$1 AND s.customer_id=$2 AND s.confirmed AND s.quoted_service_cents IS NOT NULL
   AND coalesce(s.booking_environment,'test')=$3 AND s.starts_at>now() FOR UPDATE OF s`,[id,actor,records.live?'live':'test'])).rows[0];
  if(!slot)fail(404,'booking_checkout_unavailable');
  const existing=(await db.query(`SELECT * FROM ${records.payments} WHERE request_id=$1`,[id])).rows[0];
  if(existing)return existing;
  const expires=Math.min(+new Date(slot.starts_at),Date.now()+40*60000);
  if(expires-Date.now()<32*60000)fail(409,'booking_checkout_closed');
  const account=await connect.accounts.retrieve(slot.stripe_account_id);
  if(account.capabilities?.transfers!=='active'||account.payouts_enabled!==true)fail(409,'provider_payouts_pending');
  const payment=(await db.query(`INSERT INTO ${records.payments}(request_id,destination_account,service_cents,fee_cents,expires_at)
   VALUES($1,$2,$3,$4,$5) RETURNING *`,[id,slot.stripe_account_id,slot.quoted_service_cents,slot.quoted_fee_cents,new Date(expires)])).rows[0];
  await db.query('UPDATE service_slots SET payment_locked=true WHERE request_id=$1',[id]);
  return payment;
 });
 if(booking.state!=='open')fail(409,'booking_payment_closed');

 const result=await transaction(pool,async db=>{
  const payment=(await db.query(`SELECT * FROM ${records.payments} WHERE request_id=$1 FOR UPDATE`,[id])).rows[0];
  if(payment.state!=='open')return null;
  const cutoff=+new Date(payment.expires_at);
  let session;
  if(!payment.session_id && cutoff-Date.now()<31*60000){
   if(records.live){
    session=await findLiveSession(connect,payment,fail);
    if(session){
     await db.query(`UPDATE ${records.payments} SET session_id=$2 WHERE request_id=$1`,[id,session.id]);
    }else if(Date.now()<cutoff+5*60000){
     return null;
    }
   }
   if(!session){
    await db.query(`UPDATE ${records.payments} SET state='expired' WHERE request_id=$1`,[id]);
    await db.query('UPDATE service_slots SET payment_locked=false WHERE request_id=$1',[id]);
    return null;
   }
  }
  if(payment.session_id){
   session=await connect.checkout.sessions.retrieve(payment.session_id);
  }else if(!session){
   const metadata=records.live?{tired_booking:id,tired_platform:'tired.events'}:{tired_booking:id};
   const items=[{name:'Provider service',amount:payment.service_cents}];
   if(payment.fee_cents)items.push({name:'Platform fee',amount:payment.fee_cents});
   session=await connect.checkout.sessions.create({mode:'payment',adaptive_pricing:{enabled:false},metadata,
    ...(records.live?{client_reference_id:id}:{}),
    expires_at:Math.floor(cutoff/1000),success_url:origin+'/#talent',cancel_url:origin+'/#talent',
    line_items:items.map(item=>({quantity:1,price_data:{currency:'usd',unit_amount:item.amount,product_data:{name:item.name}}})),
    payment_intent_data:{metadata,transfer_data:{destination:payment.destination_account,amount:payment.service_cents}}
   },{idempotencyKey:(records.live?'live-booking-':'booking-')+id});
  }
  if(session.livemode!==records.live || session.status!=='open' || !session.url ||
    new URL(session.url).origin!=='https://checkout.stripe.com')return null;
  if(!payment.session_id)await db.query(`UPDATE ${records.payments} SET session_id=$2 WHERE request_id=$1`,[id,session.id]);
  return {url:session.url};
 });
 if(!result)fail(409,'refresh_booking_payment');
 return send(200,result);
}

export async function reconcileBookingPayment({event,pool,fail,records=sandboxRecords}){
 const data=event.data.object;
 const id=data.metadata?.tired_booking;
 if(typeof id!=='string'||!uuid.test(id))return;
 const release=['checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type);
 const paid=['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type);
 const refund=event.type==='charge.refunded';
 if(!release&&!paid&&!refund)return;

 await transaction(pool,async db=>{
  const payment=(await db.query(`SELECT * FROM ${records.payments} WHERE request_id=$1 FOR UPDATE`,[id])).rows[0];
  if(!payment)fail(503,'booking_payment_unavailable');
  if(!refund&&data.id!==payment.session_id){
   if(!records.live||payment.session_id||data.client_reference_id!==id||data.metadata?.tired_platform!=='tired.events'||
      data.mode!=='payment'||data.currency!=='usd'||data.amount_total!==payment.service_cents+payment.fee_cents)return;
   await db.query(`UPDATE ${records.payments} SET session_id=$2 WHERE request_id=$1`,[id,data.id]);
  }
  if(records.live && refund && !payment.payment_id)fail(503,'await_booking_payment_confirmation');
  if(release){
   const changed=await db.query(`UPDATE ${records.payments} SET state='expired' WHERE request_id=$1 AND state='open'`,[id]);
   if(changed.rowCount)await db.query('UPDATE service_slots SET payment_locked=false WHERE request_id=$1',[id]);
   return;
  }

  if(paid&&(data.payment_status!=='paid'||data.mode!=='payment'))return;
  const total=payment.service_cents+payment.fee_cents;
  if(data.currency!=='usd'||(refund?data.amount:data.amount_total)!==total||
    typeof data.payment_intent!=='string'||(payment.payment_id&&payment.payment_id!==data.payment_intent))fail(409,'booking_payment_mismatch');
  if(refund){
   if(!Number.isInteger(data.amount_refunded)||data.amount_refunded<0||data.amount_refunded>total)fail(400,'invalid_refund');
   await db.query(`UPDATE ${records.payments} SET payment_id=$2,refunded_cents=greatest(refunded_cents,$3),
    state=CASE WHEN $3=$4 THEN 'refunded' ELSE state END WHERE request_id=$1`,[id,data.payment_intent,data.amount_refunded,total]);
   if(data.amount_refunded===total)await db.query('UPDATE service_slots SET payment_locked=false WHERE request_id=$1',[id]);
   return;
  }
  await db.query(`UPDATE ${records.payments} SET payment_id=$2,state='paid' WHERE request_id=$1 AND state='open'`,[id,data.payment_intent]);
 });
}

export async function bookingRefund({pool,connect,actor,id,send,fail,records=sandboxRecords}){
 const result=await transaction(pool,async db=>{
  const payment=(await db.query(`SELECT b.payment_id,b.state FROM ${records.payments} b
   JOIN service_slots s ON s.request_id=b.request_id WHERE b.request_id=$1 AND s.provider_id=$2
   FOR UPDATE OF b`,[id,actor])).rows[0];
  if(!payment)fail(404,'not_found');
  if(payment.state==='refunded')return {status:'refunded'};
  if(payment.state!=='paid'||!payment.payment_id)fail(409,'booking_refund_unavailable');

  const refund=await connect.refunds.create({payment_intent:payment.payment_id,reverse_transfer:true},
   {idempotencyKey:'booking-full-refund-'+id.toLowerCase()});
  if(refund.status==='failed'||refund.status==='canceled')fail(409,'refund_failed_check_stripe');
  return {status:refund.status};
 });
 return send(200,result);
}

async function verifiedTransfer({pool,connect,actor,id,fail,records=sandboxRecords}){
 const payment=(await pool.query(`SELECT b.payment_id,b.state,b.service_cents,b.fee_cents,b.destination_account,b.refunded_cents
  FROM ${records.payments} b JOIN service_slots s ON s.request_id=b.request_id
  WHERE b.request_id=$1 AND s.provider_id=$2`,[id,actor])).rows[0];
 if(!payment)fail(404,'not_found');
 if(!['paid','refunded'].includes(payment.state)||!payment.payment_id)fail(409,'booking_transfer_unavailable');

 const intent=await connect.paymentIntents.retrieve(payment.payment_id,{expand:['latest_charge']});
 const charge=intent.latest_charge;
 const total=payment.service_cents+payment.fee_cents;
 if(intent.livemode!==records.live||intent.status!=='succeeded'||intent.currency!=='usd'||
    intent.amount_received!==total||intent.metadata?.tired_booking?.toLowerCase()!==id.toLowerCase()||
    !charge||typeof charge!=='object'||charge.livemode!==records.live||charge.paid!==true||
    charge.amount!==total||typeof charge.transfer!=='string')fail(409,'booking_transfer_unverified');

 const transfer=await connect.transfers.retrieve(charge.transfer);
 if(transfer.livemode!==records.live||transfer.currency!=='usd'||transfer.source_transaction!==charge.id||
    transfer.destination!==payment.destination_account||transfer.amount!==payment.service_cents)
  fail(409,'booking_transfer_mismatch');

 return {payment,charge,transfer,total};
}

export async function bookingTransfer(context){
 const {charge,transfer,total}=await verifiedTransfer(context);
 return context.send(200,{currency:'usd',chargedCents:total,refundedCents:charge.amount_refunded,
  transferredCents:transfer.amount,reversedCents:transfer.amount_reversed});
}

export async function bookingPayout(context){
 const {payment,charge,transfer}=await verifiedTransfer(context);
 if(payment.state==='refunded' || payment.refunded_cents!==0 || charge.amount_refunded!==0 || transfer.amount_reversed!==0){
  return context.send(200,{status:'adjusted'});
 }
 if(typeof transfer.destination_payment!=='string' || !/^(py|ch)_[A-Za-z0-9]+$/.test(transfer.destination_payment)){
  return context.send(200,{status:'missing_payment'});
 }
 const payouts=await recentPayouts(context.connect, payment.destination_account, context.fail, transfer.destination_payment, context.records?.live??false);
 return context.send(200,matchBookingPayout(payouts,payment.service_cents));
}
