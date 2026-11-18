import {transaction} from './database.mjs';

export async function organizerTickets({pool,id,actor,action,req,send,fail,readJson,fields,uuid}) {
 const result=await transaction(pool,async db=>{
  const event=await db.query(`SELECT id FROM events WHERE id=$1 AND owner_id=$2
   AND publication='published' AND ticket_price_cents IS NOT NULL
   AND starts_at>now()-interval '24 hours' FOR SHARE`,[id,actor]);
  if(!event.rowCount)fail(404,'not_found');

  if(action==='guest-list'){
   const {rows}=await db.query(`SELECT p.display_name,p.handle,o.checked_in_at,o.amount-o.refunded AS net_cents
    FROM ticket_orders o JOIN profiles p ON p.user_id=o.buyer_id
    WHERE o.event_id=$1 AND o.state='issued'
    ORDER BY p.display_name,p.handle`,[id]);
   const guests=rows.map(({display_name,handle,checked_in_at})=>({display_name,handle,checked_in_at}));
   const totals={issued:guests.length,checked_in:guests.filter(guest=>guest.checked_in_at).length,
    net_cents:String(rows.reduce((sum,row)=>sum+row.net_cents,0))};
   return {guests,totals};
  }

  const body=await readJson(req);
  fields(body,['code']);
  if(typeof body.code!=='string'||!uuid(body.code))fail(400,'invalid_ticket_code');
  const ticket=(await db.query(`SELECT state,checked_in_at FROM ticket_orders
   WHERE event_id=$1 AND id=$2 FOR UPDATE`,[id,body.code])).rows[0];
  if(ticket?.state!=='issued')fail(404,'ticket_not_valid');
  if(ticket.checked_in_at)fail(409,'ticket_already_checked_in');
  const checkedIn=await db.query('UPDATE ticket_orders SET checked_in_at=now() WHERE id=$1 RETURNING checked_in_at',[body.code]);
  return checkedIn.rows[0];
 });
 return send(200,result);
}
