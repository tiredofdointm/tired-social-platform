import {transaction} from './database.mjs';

export async function organizerTickets({pool,payments,id,actor,action,req,send,fail,readJson,fields,uuid}) {
 const result=await transaction(pool,async db=>{
  const event=await db.query(`SELECT id FROM events WHERE id=$1 AND owner_id=$2
   AND publication='published' AND ticket_price_cents IS NOT NULL
   AND starts_at>now()-interval '24 hours' FOR SHARE`,[id,actor]);
  if(!event.rowCount)fail(404,'not_found');

  if(action==='guest-list'){
   const {rows}=await db.query(`SELECT p.display_name,p.handle,o.id AS order_id,o.checked_in_at,o.payment_id IS NOT NULL AS refundable,o.amount-o.refunded AS net_cents
    FROM ticket_orders o JOIN profiles p ON p.user_id=o.buyer_id
    WHERE o.event_id=$1 AND o.state='issued'
    ORDER BY p.display_name,p.handle`,[id]);
   const guests=rows.map(({display_name,handle,order_id,checked_in_at,refundable})=>({display_name,handle,order_id,checked_in_at,refundable}));
   const totals={issued:guests.length,checked_in:guests.filter(guest=>guest.checked_in_at).length,
    net_cents:String(rows.reduce((sum,row)=>sum+row.net_cents,0))};
   return {guests,totals};
  }

  const body=await readJson(req);
  if(action==='refund'){
   fields(body,['orderId']);
   if(typeof body.orderId!=='string'||!uuid(body.orderId))fail(400,'invalid_order');
   const order=(await db.query(`SELECT payment_id,state FROM ticket_orders
    WHERE event_id=$1 AND id=$2 FOR UPDATE`,[id,body.orderId])).rows[0];
   if(!order)fail(404,'not_found');
   if(order.state==='refunded')return {status:'refunded'};
   if(order.state!=='issued' || !order.payment_id)fail(409,'ticket_cannot_be_refunded');
   const refund=await payments.refunds.create({payment_intent:order.payment_id},
    {idempotencyKey:'ticket-full-refund-'+body.orderId.toLowerCase()});
   if(refund.status==='failed' || refund.status==='canceled')fail(409,'refund_failed_check_stripe');
   return {status:refund.status};
  }

  fields(body,['code']);
  if(typeof body.code!=='string'||!uuid(body.code))fail(400,'invalid_ticket_code');
  const ticket=(await db.query(`SELECT state,checked_in_at FROM ticket_orders
   WHERE event_id=$1 AND admission_code=$2 FOR UPDATE`,[id,body.code])).rows[0];
  if(ticket?.state!=='issued')fail(404,'ticket_not_valid');
  if(ticket.checked_in_at)fail(409,'ticket_already_checked_in');
  const checkedIn=await db.query('UPDATE ticket_orders SET checked_in_at=now() WHERE admission_code=$1 RETURNING checked_in_at',[body.code]);
  return checkedIn.rows[0];
 });
 return send(200,result);
}
