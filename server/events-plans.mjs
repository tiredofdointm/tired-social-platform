import {organizerTickets} from './organizer-tickets.mjs';
import {checkout} from './ticket-checkout.mjs';
import {transaction} from './database.mjs';

const visibleOwner = (owner) => `EXISTS (SELECT 1 FROM users u WHERE u.id=${owner} AND u.status='active')
 AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=${owner})
 OR (b.blocker_id=${owner} AND b.blocked_id=$1))`;

export async function eventsPlans({pool,payments,origin,actor,path,method,req,send,fail,readJson,fields,text,uuid}) {
 const checkoutEnabled=Boolean(payments);
 if (path==='/api/v1/events/publishing' && method==='GET') {
  const {rows:[policy]}=await pool.query(`SELECT manual_review,
   EXISTS(SELECT 1 FROM publishing_admins WHERE user_id=$1) AS admin
   FROM event_publishing_policy`,[actor]);
  const {rows}=await pool.query(`SELECT id,title,venue,starts_at,publication FROM events
   WHERE publication<>'published' AND (owner_id=$1 OR $2 AND publication='pending')
   AND ($3 OR ticket_price_cents IS NULL)
   ORDER BY starts_at,id LIMIT 100`,[actor,policy.admin,checkoutEnabled]);
  return send(200,{...policy,submissions:rows});
 }
 if (path==='/api/v1/events/publishing' && method==='PUT') {
  const body=await readJson(req);
  fields(body,['manualReview']);
  if(typeof body.manualReview!=='boolean')fail(400,'invalid_policy');
  const result=await pool.query(`UPDATE event_publishing_policy SET manual_review=$2
   WHERE EXISTS(SELECT 1 FROM publishing_admins WHERE user_id=$1)`,[actor,body.manualReview]);
  if(!result.rowCount)fail(403,'review_admin_required');
  return send(200,{manual_review:body.manualReview});
 }
 const review=/^\/api\/v1\/events\/([^/]+)\/review$/.exec(path);
 if(review && method==='PUT'){
  if(!uuid(review[1]))fail(404,'not_found');
  const body=await readJson(req);
  fields(body,['decision']);
  if(!['published','rejected'].includes(body.decision))fail(400,'invalid_decision');
  const result=await pool.query(`UPDATE events SET publication=$3, reviewed_by=$1, reviewed_at=now()
   WHERE id=$2 AND publication='pending' AND ($4 OR ticket_price_cents IS NULL)
   AND EXISTS(SELECT 1 FROM publishing_admins WHERE user_id=$1)
   RETURNING publication`,[actor,review[1],body.decision,checkoutEnabled]);
  if(!result.rowCount)fail(404,'not_found');
  return send(200,result.rows[0]);
 }
 if (path === '/api/v1/events' && method === 'GET') {
  const {rows}=await pool.query(`SELECT e.id,e.title,e.venue,e.starts_at,e.capacity,e.ticket_price_cents,e.owner_id=$1 AS owner,e.starts_at>now() AS upcoming,
   (SELECT count(*)::int FROM ticket_orders o WHERE o.event_id=e.id AND o.state IN ('open','issued')) + (SELECT count(*)::int FROM ticket_holds h WHERE h.event_id=e.id AND h.expires_at>now()) AS held,
   (SELECT state FROM ticket_orders o WHERE o.event_id=e.id AND o.buyer_id=$1 ORDER BY (state IN ('open','issued')) DESC, (state='refunded') DESC LIMIT 1) AS ticket_state,
   (SELECT id FROM ticket_orders o WHERE o.event_id=e.id AND o.buyer_id=$1 AND o.state='issued') AS my_ticket_code,
   (SELECT checked_in_at FROM ticket_orders o WHERE o.event_id=e.id AND o.buyer_id=$1 AND o.state='issued') AS my_checked_in_at,
   (SELECT expires_at FROM ticket_holds h WHERE h.event_id=e.id AND h.buyer_id=$1 AND h.expires_at>now()) AS my_hold_until,
   (SELECT count(*)::int FROM rsvps r WHERE r.event_id=e.id) AS attending,
   EXISTS(SELECT 1 FROM rsvps r WHERE r.event_id=e.id AND r.user_id=$1) AS going
   FROM events e WHERE (e.starts_at>now() OR (e.ticket_price_cents IS NOT NULL AND e.starts_at>now()-interval '24 hours'
   AND (e.owner_id=$1 OR EXISTS (SELECT 1 FROM ticket_orders o WHERE o.event_id=e.id AND o.buyer_id=$1 AND o.state='issued'))))
   AND e.publication='published' AND ($2 OR e.ticket_price_cents IS NULL) AND ${visibleOwner('e.owner_id')}
   ORDER BY e.starts_at,e.id LIMIT 100`,[actor,checkoutEnabled]);
  return send(200,{events:rows,checkoutEnabled});
 }
 if (path === '/api/v1/plans' && method === 'GET') {
  const {rows}=await pool.query(`SELECT p.id,p.title,
   CASE WHEN p.owner_id=$1 OR m.accepted THEN p.details END AS details,
   CASE WHEN p.owner_id=$1 OR m.accepted THEN p.starts_at END AS starts_at,
   p.owner_id=$1 AS owner, coalesce(m.accepted,false) AS accepted
   FROM friend_plans p LEFT JOIN friend_plan_members m ON m.plan_id=p.id AND m.user_id=$1
   WHERE (p.owner_id=$1 OR m.user_id=$1) AND ${visibleOwner('p.owner_id')}
   ORDER BY p.starts_at,p.id LIMIT 100`,[actor]);
  return send(200,{plans:rows});
 }
 if (['/api/v1/events','/api/v1/plans'].includes(path) && method === 'POST') {
  const body=await readJson(req);
  const event=path.endsWith('/events');
  fields(body,event?['title','venue','startsAt','capacity','ticketPriceCents']:['title','details','startsAt']);
  const startsAt=typeof body.startsAt==='string' && /Z$/.test(body.startsAt)?Date.parse(body.startsAt):NaN;
  if (!Number.isFinite(startsAt) || startsAt<=Date.now()) fail(400,'invalid_start_time');
  const values=[actor,text(body.title,120),new Date(startsAt),text(event?body.venue:body.details,event?160:1000)];
  if (event) {
   if (!Number.isInteger(body.capacity)||body.capacity<1||body.capacity>10000) fail(400,'invalid_capacity');
   if (body.ticketPriceCents != null && (!Number.isInteger(body.ticketPriceCents) ||
       body.ticketPriceCents<50 || body.ticketPriceCents>99999999)) fail(400,'invalid_ticket_price');
   if(body.ticketPriceCents != null && !checkoutEnabled)fail(503,'sandbox_checkout_unavailable');
   values.push(body.capacity,body.ticketPriceCents??null);
  }
  const {rows}=await pool.query(event
   ?`INSERT INTO events(owner_id,title,starts_at,venue,capacity,ticket_price_cents,publication)
      SELECT $1,$2,$3,$4,$5,$6,CASE WHEN manual_review THEN 'pending' ELSE 'published' END
      FROM event_publishing_policy RETURNING id,publication`
   :'INSERT INTO friend_plans(owner_id,title,starts_at,details) VALUES($1,$2,$3,$4) RETURNING id',values);
  return send(201,rows[0]);
 }
 const match=/^\/api\/v1\/(events|plans)\/([^/]+)\/(rsvp|ticket-hold|checkout|guest-list|check-in|invite|membership)$/.exec(path);
 if (!match || !uuid(match[2])) fail(404,'not_found');
 const [,resource,id,action]=match;
 if(resource==='events' && ['checkout','ticket-hold','guest-list','check-in'].includes(action) && !checkoutEnabled)fail(503,'sandbox_checkout_unavailable');
 if(resource==='events' && ((action==='guest-list' && method==='GET')||(action==='check-in' && method==='POST'))){
  return organizerTickets({pool,id,actor,action,req,send,fail,readJson,fields,uuid});
 }
 if(resource==='events' && action==='checkout' && method==='POST'){
  const result=await transaction(pool,async db=>{
   const event=(await db.query(`SELECT e.id,e.title,e.ticket_price_cents,e.starts_at FROM events e WHERE e.id=$2 AND e.starts_at>now()
    AND e.publication='published' AND e.ticket_price_cents IS NOT NULL AND ${visibleOwner('e.owner_id')} FOR UPDATE`,[actor,id])).rows[0];
   if(!event)fail(404,'not_found');
   return checkout({db,actor,event,origin,payments,fail});
  });
  return send(200,result);
 }
 if (resource==='events' && action==='ticket-hold' && ['PUT','DELETE'].includes(method)) {
  const hold=await transaction(pool,async db=>{
   if (method==='DELETE') {
    await db.query('DELETE FROM ticket_holds WHERE event_id=$1 AND buyer_id=$2',[id,actor]);
    return null;
   }
   const event=await db.query(`SELECT capacity FROM events e WHERE id=$2 AND starts_at>now()
     AND publication='published' AND ticket_price_cents IS NOT NULL AND ${visibleOwner('e.owner_id')}
     FOR UPDATE`,[actor,id]);
   if (!event.rowCount) fail(404,'not_found');
   const active=await db.query(`SELECT count(*)::int AS total,
     max(expires_at) FILTER (WHERE buyer_id=$2) AS mine FROM ticket_holds
     WHERE event_id=$1 AND expires_at>now()`,[id,actor]);
   if (active.rows[0].mine) return active.rows[0].mine;
   const orders=(await db.query("SELECT count(*)::int AS total,bool_or(buyer_id=$2) AS mine FROM ticket_orders WHERE event_id=$1 AND state IN ('open','issued')",[id,actor])).rows[0];
   if(orders.mine)fail(409,'existing_ticket_order');
   if (active.rows[0].total+orders.total>=event.rows[0].capacity) fail(409,'event_full');
   const result=await db.query(`INSERT INTO ticket_holds(event_id,buyer_id,expires_at)
     SELECT id,$2,least(starts_at,now()+interval '10 minutes') FROM events WHERE id=$1
     ON CONFLICT(event_id,buyer_id) DO UPDATE SET expires_at=excluded.expires_at,attempt_id=excluded.attempt_id RETURNING expires_at`,[id,actor]);
   return result.rows[0].expires_at;
  });
  return send(200,{expiresAt:hold});
 }
 if (resource==='events' && action==='rsvp' && ['PUT','DELETE'].includes(method)) {
  await transaction(pool,async db=>{
   const {rows}=await db.query(`SELECT capacity FROM events e WHERE id=$2 AND ticket_price_cents IS NULL AND starts_at>now() AND publication='published'
    AND ${visibleOwner('e.owner_id')} FOR UPDATE`,[actor,id]);
   if (!rows.length) fail(404,'not_found');
   if (method==='DELETE') {
    await db.query('DELETE FROM rsvps WHERE user_id=$1 AND event_id=$2',[actor,id]);
    return;
   }
   const status=await db.query(`SELECT count(*)::int AS total,
    coalesce(bool_or(user_id=$1),false) AS already FROM rsvps WHERE event_id=$2`,[actor,id]);
   if (status.rows[0].already) return;
   if (status.rows[0].total>=rows[0].capacity) fail(409,'event_full');
   await db.query('INSERT INTO rsvps(user_id,event_id) VALUES($1,$2)',[actor,id]);
  });
  return send(200,{going:method==='PUT'});
 }
 if (resource==='plans' && action==='invite' && method==='PUT') {
  const body=await readJson(req);
  fields(body,['handle']);
  const {rows}=await pool.query(`SELECT u.id FROM friend_plans p JOIN profiles pr ON pr.handle=$3
   JOIN users u ON u.id=pr.user_id WHERE p.id=$2 AND p.owner_id=$1 AND u.id<>$1
   AND ${visibleOwner('u.id')}`,[actor,id,text(body.handle,30)]);
  if (!rows.length) fail(404,'not_found');
  await pool.query('INSERT INTO friend_plan_members(plan_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,rows[0].id]);
  return send(200,{invited:true});
 }
 if (resource==='plans' && action==='membership' && ['PUT','DELETE'].includes(method)) {
  const {rowCount}=await pool.query(`${method==='PUT'?'UPDATE friend_plan_members m SET accepted=true FROM':'DELETE FROM friend_plan_members m USING'}
   friend_plans p WHERE m.plan_id=p.id AND p.id=$2 AND m.user_id=$1 AND ${visibleOwner('p.owner_id')}`,[actor,id]);
  if (!rowCount) fail(404,'not_found');
  return send(200,{accepted:method==='PUT'});
 }
 fail(404,'not_found');
}
