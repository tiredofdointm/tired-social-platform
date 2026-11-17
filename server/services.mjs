const categories = ['Photography', 'DJ', 'Security', 'Other'];

export async function services({pool, actor, path, method, req, send, fail, readJson, fields, text, uuid}) {
  if (path === '/api/v1/services' && method === 'GET') {
    const {rows} = await pool.query(`SELECT s.id, s.title, s.category, s.description,
      p.handle, p.display_name FROM service_listings s
      JOIN users u ON u.id=s.owner_id AND u.status='active'
      JOIN profiles p ON p.user_id=s.owner_id
      WHERE s.publication='published' AND s.withdrawn_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE
        (b.blocker_id=$1 AND b.blocked_id=s.owner_id) OR
        (b.blocker_id=s.owner_id AND b.blocked_id=$1))
      ORDER BY s.created_at DESC, s.id DESC LIMIT 100`, [actor]);
    return send(200, {listings:rows});
  }

  if (path === '/api/v1/services' && method === 'POST') {
    const body = await readJson(req);
    fields(body, ['title', 'category', 'description']);
    const title = text(body.title, 120);
    const description = text(body.description, 1000);
    if (!categories.includes(body.category)) fail(400, 'invalid_category');
    const {rows} = await pool.query(`INSERT INTO service_listings(owner_id,title,category,description,publication)
      SELECT $1,$2,$3,$4,CASE WHEN manual_review THEN 'pending' ELSE 'published' END
      FROM service_publishing_policy RETURNING id,publication`, [actor, title, body.category, description]);
    return send(201, rows[0]);
  }

  if (path === '/api/v1/services/publishing' && method === 'GET') {
    const {rows:[policy]} = await pool.query(`SELECT manual_review,
      EXISTS(SELECT 1 FROM publishing_admins WHERE user_id=$1) AS admin
      FROM service_publishing_policy`, [actor]);
    const {rows:mine} = await pool.query(`SELECT id,title,category,description,publication
      FROM service_listings WHERE owner_id=$1 AND withdrawn_at IS NULL
      ORDER BY created_at DESC,id DESC LIMIT 100`, [actor]);
    const {rows:pending} = policy.admin ? await pool.query(`SELECT s.id,s.title,s.category,s.description,p.handle
      FROM service_listings s JOIN profiles p ON p.user_id=s.owner_id
      JOIN users u ON u.id=s.owner_id AND u.status='active'
      WHERE s.publication='pending' AND s.withdrawn_at IS NULL
      ORDER BY s.created_at,s.id LIMIT 100`) : {rows:[]};
    return send(200, {...policy, mine, pending});
  }

  if (path === '/api/v1/services/publishing' && method === 'PUT') {
    const body = await readJson(req);
    fields(body, ['manualReview']);
    if (typeof body.manualReview !== 'boolean') fail(400, 'invalid_policy');
    const {rowCount} = await pool.query(`UPDATE service_publishing_policy SET manual_review=$2
      WHERE EXISTS(SELECT 1 FROM publishing_admins WHERE user_id=$1)`, [actor, body.manualReview]);
    if (!rowCount) fail(403, 'review_admin_required');
    return send(200, {manual_review:body.manualReview});
  }

  const review = /^\/api\/v1\/services\/([^/]+)\/review$/.exec(path);
  if (review && method === 'PUT' && uuid(review[1])) {
    const body = await readJson(req);
    fields(body, ['decision']);
    if (!['published','rejected'].includes(body.decision)) fail(400, 'invalid_decision');
    const {rows:[listing]} = await pool.query(`UPDATE service_listings SET publication=$3, reviewed_by=$1, reviewed_at=now()
      WHERE id=$2 AND publication='pending' AND withdrawn_at IS NULL
      AND EXISTS(SELECT 1 FROM publishing_admins WHERE user_id=$1)
      AND EXISTS(SELECT 1 FROM users u WHERE u.id=owner_id AND u.status='active')
      RETURNING id,publication`, [actor, review[1], body.decision]);
    if (!listing) fail(404, 'not_found');
    return send(200, listing);
  }

  const listing = /^\/api\/v1\/services\/([^/]+)$/.exec(path);
  if (listing && method === 'DELETE' && uuid(listing[1])) {
    const {rowCount} = await pool.query(`UPDATE service_listings SET withdrawn_at=now()
      WHERE owner_id=$1 AND id=$2 AND withdrawn_at IS NULL`, [actor, listing[1]]);
    if (!rowCount) fail(404, 'not_found');
    return send(200, {withdrawn:true});
  }

  fail(404, 'not_found');
}
