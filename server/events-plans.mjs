import {transaction} from './database.mjs';

const visibleOwner = (owner) => `EXISTS (SELECT 1 FROM users u WHERE u.id=${owner} AND u.status='active')
 AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=$1 AND b.blocked_id=${owner})
 OR (b.blocker_id=${owner} AND b.blocked_id=$1))`;

export async function eventsPlans({pool,actor,path,method,req,send,fail,readJson,fields,text,uuid}) {
 if (path === '/api/v1/events' && method === 'GET') {
  const {rows}=await pool.query(`SELECT e.id,e.title,e.venue,e.starts_at,e.capacity,
   (SELECT count(*)::int FROM rsvps r WHERE r.event_id=e.id) AS attending,
   EXISTS(SELECT 1 FROM rsvps r WHERE r.event_id=e.id AND r.user_id=$1) AS going
   FROM events e WHERE e.starts_at>now() AND ${visibleOwner('e.owner_id')}
   ORDER BY e.starts_at,e.id LIMIT 100`,[actor]);
  return send(200,{events:rows});
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
  fields(body,event?['title','venue','startsAt','capacity']:['title','details','startsAt']);
  const startsAt=typeof body.startsAt==='string' && /Z$/.test(body.startsAt)?Date.parse(body.startsAt):NaN;
  if (!Number.isFinite(startsAt) || startsAt<=Date.now()) fail(400,'invalid_start_time');
  const values=[actor,text(body.title,120),new Date(startsAt),text(event?body.venue:body.details,event?160:1000)];
  if (event) {
   if (!Number.isInteger(body.capacity)||body.capacity<1||body.capacity>10000) fail(400,'invalid_capacity');
   values.push(body.capacity);
  }
  const {rows}=await pool.query(event
   ?'INSERT INTO events(owner_id,title,starts_at,venue,capacity) VALUES($1,$2,$3,$4,$5) RETURNING id'
   :'INSERT INTO friend_plans(owner_id,title,starts_at,details) VALUES($1,$2,$3,$4) RETURNING id',values);
  return send(201,rows[0]);
 }
 const match=/^\/api\/v1\/(events|plans)\/([^/]+)\/(rsvp|invite|membership)$/.exec(path);
 if (!match || !uuid(match[2])) fail(404,'not_found');
 const [,resource,id,action]=match;
 if (resource==='events' && action==='rsvp' && ['PUT','DELETE'].includes(method)) {
  await transaction(pool,async db=>{
   const {rows}=await db.query(`SELECT capacity FROM events e WHERE id=$2 AND starts_at>now()
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
