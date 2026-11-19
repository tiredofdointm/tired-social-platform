import {transaction} from './database.mjs';

export async function organizerTickets({pool,payments,id,actor,action,req,send,fail,readJson,fields,uuid}) {
 const result=await transaction(pool,async db=>{
  const {rows:[event]}=await db.query(`SELECT owner_id FROM events WHERE id=$1
   AND live_ticket=$2 AND publication='published' AND ticket_price_cents IS NOT NULL
   AND starts_at>now()-interval '24 hours' FOR SHARE`,[id,payments.live===true]);
  if(!event)fail(404,'not_found');
  if(event.owner_id!==actor){
   if(action!=='check-in')fail(404,'not_found');
   const grant=await db.query(`SELECT user_id FROM event_check_in_staff WHERE event_id=$1 AND user_id=$2
    AND EXISTS(SELECT 1 FROM users WHERE id=$3 AND status='active')
    AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=$2 AND blocked_id=$3) OR (blocker_id=$3 AND blocked_id=$2))
    FOR SHARE`,[id,actor,event.owner_id]);
   if(!grant.rowCount)fail(404,'not_found');
  }

  if(action==='staff'){
   if(req.method==='GET'){
    const {rows}=await db.query(`SELECT p.user_id,p.handle FROM event_check_in_staff s JOIN profiles p ON p.user_id=s.user_id
      WHERE s.event_id=$1 ORDER BY p.handle`,[id]);
    return {staff:rows};
   }
   const body=await readJson(req);
   let changed;
   const granting=req.method==='PUT';
   if(granting){
    fields(body,['handle']);
    if(typeof body.handle!=='string'||!/^[a-z0-9_]{3,30}$/.test(body.handle))fail(400,'invalid_handle');
    const {rows:[person]}=await db.query(`SELECT p.user_id FROM profiles p JOIN users u ON u.id=p.user_id
     WHERE p.handle=$2 AND p.user_id<>$1 AND u.status='active'
     AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=$1 AND blocked_id=p.user_id) OR (blocker_id=p.user_id AND blocked_id=$1))`,[actor,body.handle]);
    if(!person)fail(404,'account_unavailable');
    changed=await db.query('INSERT INTO event_check_in_staff(event_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id',[id,person.user_id]);
   }else{
    fields(body,['userId']);
    if(typeof body.userId!=='string'||!uuid(body.userId))fail(400,'invalid_account');
    changed=await db.query('DELETE FROM event_check_in_staff WHERE event_id=$1 AND user_id=$2 RETURNING user_id',[id,body.userId]);
   }
   if(changed.rowCount)await db.query('INSERT INTO event_staff_changes(event_id,user_id,actor_id,granted) VALUES($1,$2,$3,$4)',[id,changed.rows[0].user_id,actor,granting]);
   return {granted:granting};
  }

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
   const refund=await payments.refunds.create({payment_intent:order.payment_id,...(payments.live?{reverse_transfer:true}:{})},
    {idempotencyKey:'ticket-full-refund-'+body.orderId.toLowerCase()});
   if(refund.status==='failed' || refund.status==='canceled')fail(409,'refund_failed_check_stripe');
   return {status:refund.status};
  }

  fields(body,['code']);
  if(typeof body.code!=='string'||!uuid(body.code))fail(400,'invalid_ticket_code');
  const ticket=(await db.query(`SELECT state,checked_in_at FROM ticket_orders
   WHERE event_id=$1 AND admission_code=$2 FOR UPDATE`,[id,body.code])).rows[0];
  if(ticket?.state!=='issued')fail(404,'ticket_not_valid');
  if(ticket.checked_in_at)return {duplicate:true,checked_in_at:ticket.checked_in_at};
  const checkedIn=await db.query('UPDATE ticket_orders SET checked_in_at=now(),checked_in_by=$2 WHERE admission_code=$1 RETURNING checked_in_at',[body.code,actor]);
  return checkedIn.rows[0];
 });
 if(result.duplicate){
  return send(409,{error:{code:'ticket_already_checked_in',message:'Ticket already checked in at '+result.checked_in_at.toISOString()},checked_in_at:result.checked_in_at});
 }
 return send(200,result);
}
