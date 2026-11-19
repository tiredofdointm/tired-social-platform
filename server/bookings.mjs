import {sandboxRecords} from './live-booking-config.mjs';
import {bookingCheckout,bookingRefund,bookingTransfer,bookingPayout} from './booking-payments.mjs';

export function sandboxBookingFee(connect, env=process.env){
  const value=env.STRIPE_BOOKING_TEST_FEE_BPS;
  if(!connect || value===undefined)return null;
  if(!/^\d{1,5}$/.test(value) || Number(value)>10000)throw Error('Invalid sandbox booking fee');
  return Number(value);
}

export async function bookingRoutes({pool, actor, path, method, req, send, fail, readJson, fields, uuid, bookingFeeBps=null,connect,origin,records=sandboxRecords}) {
  const environment=records.live||origin==='https://tired.events'?'live':'test';
  // An existing unpriced request can still be managed after the upgrade.
  // Amounts saved by older deployments were exclusively sandbox quotes.
  const sameEnvironment = (alias, parameter) => `(${alias}.booking_environment=${parameter} OR
    (${alias}.booking_environment IS NULL AND (${alias}.quoted_service_cents IS NULL OR ${parameter}='test')))`;
  const base = '/api/v1/services';
  if (path === base + '/bookings' && method === 'GET') {
    const {rows} = await pool.query(`SELECT s.request_id, s.starts_at, s.confirmed, l.title,
      CASE WHEN $2::boolean THEN b.state END AS payment_state,
      CASE WHEN $2::boolean AND s.quoted_service_cents IS NOT NULL THEN json_build_object(
        'serviceCents',s.quoted_service_cents,'feeCents',s.quoted_fee_cents,
        'totalCents',s.quoted_service_cents+s.quoted_fee_cents) END AS quote,
      s.provider_id=$1 AS provider, p.display_name AS counterpart
      FROM service_slots s JOIN service_listings l ON l.id=s.listing_id
      LEFT JOIN ${records.payments} b ON b.request_id=s.request_id
      JOIN profiles p ON p.user_id=CASE WHEN s.provider_id=$1 THEN s.customer_id ELSE s.provider_id END
      WHERE s.customer_id IS NOT NULL AND $1 IN (s.provider_id,s.customer_id)
      AND ${sameEnvironment('s','$3')} AND s.starts_at + interval '1 hour' > now() ORDER BY s.starts_at`, [actor,bookingFeeBps!==null,environment]);
    send(200, {bookings:rows,quotesEnabled:bookingFeeBps!==null,liveBookings:records.live});
    return true;
  }
  const paymentRoute=/^\/api\/v1\/services\/bookings\/([^/]+)\/(checkout|refund|transfer|payout)$/.exec(path);
  if(paymentRoute){
    const [,id,action]=paymentRoute;
    if(!uuid(id))fail(404,'not_found');
    if(method!==(['transfer','payout'].includes(action)?'GET':'POST'))fail(405,'method_not_allowed');
    if(!connect || bookingFeeBps===null)fail(503,'sandbox_booking_checkout_unavailable');
    const handler={checkout:bookingCheckout,refund:bookingRefund,transfer:bookingTransfer,payout:bookingPayout}[action];
    await handler({pool,connect,actor,id,origin,send,fail,records});
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
    result = await pool.query(`UPDATE service_slots s SET customer_id=$1, request_id=gen_random_uuid(), booking_environment=$3
      WHERE s.id=$2 AND s.customer_id IS NULL AND s.provider_id<>$1 AND s.starts_at>now()
      AND EXISTS (SELECT 1 FROM service_listings l JOIN users u ON u.id=l.owner_id
        WHERE l.id=s.listing_id AND l.withdrawn_at IS NULL AND l.publication='published'
        AND u.status='active' AND NOT EXISTS (SELECT 1 FROM blocks b WHERE
          (b.blocker_id=$1 AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=$1))
        FOR SHARE OF l) RETURNING request_id`, [actor,id,environment]);
  } else if (resource === 'slots' && action === 'remove') {
    result = await pool.query('DELETE FROM service_slots WHERE id=$2 AND provider_id=$1 AND customer_id IS NULL RETURNING id',[actor,id]);
  } else if (resource === 'bookings' && action === 'confirm') {
    const body=req.headers['transfer-encoding'] || Number(req.headers['content-length'])>0 ? await readJson(req) : {};
    fields(body,['servicePriceCents']);
    const price=body.servicePriceCents??null;
    let fee=null;
    if(price!==null){
      if(bookingFeeBps===null)fail(503,'sandbox_booking_quotes_unavailable');
      if(!Number.isInteger(price) || price<50 || price>99999999)fail(400,'invalid_service_price');
      fee=Math.floor((price*bookingFeeBps+5000)/10000);
      if(price+fee>99999999)fail(400,'booking_total_too_high');
    }
    result=await pool.query(`UPDATE service_slots AS s SET confirmed=true, booking_environment=$5,
      quoted_service_cents=CASE WHEN confirmed THEN quoted_service_cents ELSE $3::int END,
      quoted_fee_cents=CASE WHEN confirmed THEN quoted_fee_cents ELSE $4::int END
      WHERE request_id=$2 AND provider_id=$1 AND starts_at>now()
      AND ${sameEnvironment('s','$5')} AND (NOT confirmed OR $3::int IS NULL OR quoted_service_cents=$3)
      RETURNING request_id`,[actor,id,price,fee,environment]);
  } else if (resource === 'bookings' && action === 'cancel') {
    result = await pool.query(`UPDATE service_slots AS s SET confirmed=false, customer_id=NULL, request_id=NULL, booking_environment=NULL,
        quoted_service_cents=NULL, quoted_fee_cents=NULL
      WHERE request_id=$2 AND $1 IN (provider_id,customer_id) AND starts_at>now() AND NOT payment_locked AND ${sameEnvironment('s','$3')} RETURNING id`,[actor,id,environment]);
  } else return false;
  if (!result.rowCount) fail(409,'unavailable');
  send(200,result.rows[0]);
  return true;
}
