export async function bookingRoutes({pool, actor, path, method, req, send, fail, readJson, fields, uuid}) {
  const base = '/api/v1/services';
  if (path === base + '/bookings' && method === 'GET') {
    const {rows} = await pool.query(`SELECT s.request_id, s.starts_at, s.confirmed, l.title,
      s.provider_id=$1 AS provider, p.display_name AS counterpart
      FROM service_slots s JOIN service_listings l ON l.id=s.listing_id
      JOIN profiles p ON p.user_id=CASE WHEN s.provider_id=$1 THEN s.customer_id ELSE s.provider_id END
      WHERE s.customer_id IS NOT NULL AND $1 IN (s.provider_id,s.customer_id)
      AND s.starts_at + interval '1 hour' > now() ORDER BY s.starts_at`, [actor]);
    send(200, {bookings:rows});
    return true;
  }
  const match = /^\/api\/v1\/services\/(listings|slots|bookings)\/([^/]+)\/(availability|request|remove|confirm|cancel)$/.exec(path);
  if (!match || method !== 'POST') return false;
  const [,resource,id,action] = match;
  if (!uuid(id)) fail(404,'not_found');
  let result;
  if (resource === 'listings' && action === 'availability') {
    const body = await readJson(req);
    fields(body,['start']);
    const start = new Date(body.start);
    if (typeof body.start !== 'string' || !Number.isFinite(start.valueOf()) ||
        start.valueOf() <= Date.now() || start.valueOf() % 3600000 !== 0) fail(400,'invalid_start');
    result = await pool.query(`INSERT INTO service_slots(listing_id,provider_id,starts_at)
      SELECT id,owner_id,$3 FROM service_listings WHERE id=$2 AND owner_id=$1
      AND withdrawn_at IS NULL AND publication='published' AND $3::timestamptz > now()
      FOR SHARE ON CONFLICT DO NOTHING RETURNING id`, [actor,id,start]);
  } else if (resource === 'slots' && action === 'request') {
    result = await pool.query(`UPDATE service_slots s SET customer_id=$1, request_id=gen_random_uuid()
      WHERE s.id=$2 AND s.customer_id IS NULL AND s.provider_id<>$1 AND s.starts_at>now()
      AND EXISTS (SELECT 1 FROM service_listings l JOIN users u ON u.id=l.owner_id
        WHERE l.id=s.listing_id AND l.withdrawn_at IS NULL AND l.publication='published'
        AND u.status='active' AND NOT EXISTS (SELECT 1 FROM blocks b WHERE
          (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))
        FOR SHARE OF l) RETURNING request_id`, [actor,id]);
  } else if (resource === 'slots' && action === 'remove') {
    result = await pool.query('DELETE FROM service_slots WHERE id=$2 AND provider_id=$1 AND customer_id IS NULL RETURNING id',[actor,id]);
  } else if (resource === 'bookings' && action === 'confirm') {
    result = await pool.query('UPDATE service_slots SET confirmed=true WHERE request_id=$2 AND provider_id=$1 AND starts_at>now() RETURNING request_id',[actor,id]);
  } else if (resource === 'bookings' && action === 'cancel') {
    result = await pool.query(`UPDATE service_slots SET confirmed=false, customer_id=NULL, request_id=NULL
      WHERE request_id=$2 AND $1 IN (provider_id,customer_id) AND starts_at>now() RETURNING id`,[actor,id]);
  } else return false;
  if (!result.rowCount) fail(409,'unavailable');
  send(200,result.rows[0]);
  return true;
}
