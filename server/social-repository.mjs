// Internal repository API: actor IDs must come from validated server sessions.
// HTTP handlers derive actors from sessions and validate mutation CSRF.
export function socialRepository(db) {
  return {
    async createPost(actorId, { body, visibility = 'public' }) {
      const result = await db.query(`INSERT INTO posts(author_id,body,visibility)
        SELECT id,$2,$3 FROM users WHERE id=$1 AND status='active'
        RETURNING id,author_id,body,visibility,created_at::text`, [actorId, body, visibility]);
      if (!result.rowCount) throw new Error('Active actor required');
      return result.rows[0];
    },
    async getPost(viewerId, postId) {
      const result = await db.query(`SELECT p.id,p.author_id,p.body,p.visibility,p.created_at::text,
        pr.handle,pr.display_name FROM posts p JOIN profiles pr ON pr.user_id=p.author_id
        WHERE p.id=$2 AND can_view_post($1,p.id)`, [viewerId, postId]);
      return result.rows[0] ?? null;
    },
    async listFeed(viewerId, { limit = 20, before = null, mode = 'latest' } = {}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid page size');
      if (before && (typeof before.createdAt !== 'string' || typeof before.id !== 'string')) throw new Error('Invalid cursor');
      const result = await db.query(`SELECT p.id,p.author_id,p.body,p.visibility,p.created_at::text,
        pr.handle,pr.display_name,
        (SELECT count(*)::int FROM reactions r WHERE r.post_id=p.id) AS likes,
        EXISTS(SELECT 1 FROM reactions r WHERE r.post_id=p.id AND r.user_id=$1) AS liked,
        (SELECT f.status FROM follows f WHERE f.follower_id=$1 AND f.followed_id=p.author_id) AS follow_status
        FROM posts p JOIN profiles pr ON pr.user_id=p.author_id
        WHERE ($5='latest' OR p.author_id=$1 OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.followed_id=p.author_id AND f.status='accepted')) AND can_view_post($1,p.id)
        AND ($2::timestamptz IS NULL OR (p.created_at,p.id)<($2::timestamptz,$3::uuid))
        ORDER BY p.created_at DESC,p.id DESC LIMIT $4`, [viewerId, before?.createdAt ?? null, before?.id ?? null, limit, mode]);
      // Keep PostgreSQL's microsecond timestamp text intact for stable cursor paging.
      return result.rows;
    },
    async updatePost(actorId, postId, { body, visibility }) {
      const result = await db.query(`UPDATE posts p SET body=$3,visibility=$4
        WHERE p.id=$2 AND p.author_id=$1 AND p.deleted_at IS NULL AND p.moderation_state='visible'
        AND EXISTS(SELECT 1 FROM users WHERE id=$1 AND status='active')
        RETURNING p.id,p.author_id,p.body,p.visibility,p.created_at::text`, [actorId, postId, body, visibility]);
      return result.rows[0] ?? null;
    }
  };
}
