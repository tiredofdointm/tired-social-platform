-- PostgreSQL 16+. Apply once using a migration runner with ON_ERROR_STOP.
-- This creates the first identity/social foundation, not public API authorization.
BEGIN;
CREATE TABLE schema_migrations (
 version integer PRIMARY KEY,
 applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 identity_issuer text NOT NULL,
 identity_subject text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(identity_issuer, identity_subject),
 CHECK (length(btrim(identity_issuer)) > 0 AND length(btrim(identity_subject)) > 0)
);
CREATE TABLE profiles (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 handle text NOT NULL UNIQUE CHECK (handle ~ '^[a-z0-9_]{3,30}$'),
 display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),
 bio text NOT NULL DEFAULT '' CHECK (length(bio) <= 500),
 visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash)=32),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK (expires_at > created_at),
 CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at) WHERE revoked_at IS NULL;
CREATE TABLE follows (
 follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 followed_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(follower_id,followed_id),
 CHECK(follower_id <> followed_id)
);
CREATE INDEX follows_followed_idx ON follows(followed_id);
CREATE TABLE blocks (
 blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(blocker_id,blocked_id),
 CHECK(blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_idx ON blocks(blocked_id);
CREATE TABLE posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
 visibility text NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','followers','private')),
 moderation_state text NOT NULL DEFAULT 'visible' CHECK(moderation_state IN ('visible','hidden','removed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz
);
CREATE INDEX posts_author_timeline_idx ON posts(author_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX posts_public_timeline_idx ON posts(created_at DESC,id DESC)
 WHERE visibility='public' AND moderation_state='visible' AND deleted_at IS NULL;
CREATE TABLE reactions (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 kind text NOT NULL DEFAULT 'like' CHECK (kind='like'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,post_id,kind)
);
CREATE INDEX reactions_post_idx ON reactions(post_id);
CREATE TABLE comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 author_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz
);
CREATE INDEX comments_post_idx ON comments(post_id,created_at,id) WHERE deleted_at IS NULL;
CREATE FUNCTION stamp_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 NEW.updated_at=now();
 RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION stamp_updated_at();
CREATE TRIGGER posts_updated BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION stamp_updated_at();
CREATE TRIGGER comments_updated BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION stamp_updated_at();
-- Shared authorization predicate for future API queries. This does NOT grant database access
-- and is not a substitute for session validation or endpoint-level mutation authorization.
CREATE FUNCTION can_view_post(viewer uuid, target uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
 SELECT EXISTS(
  SELECT 1 FROM posts p JOIN users author ON author.id=p.author_id
  WHERE p.id=target AND p.deleted_at IS NULL AND p.moderation_state='visible'
   AND author.status='active'
   AND (viewer IS NULL OR EXISTS(SELECT 1 FROM users v WHERE v.id=viewer AND v.status='active'))
   AND NOT EXISTS(SELECT 1 FROM blocks b WHERE
    (b.blocker_id=viewer AND b.blocked_id=p.author_id) OR
    (b.blocker_id=p.author_id AND b.blocked_id=viewer))
   AND (p.author_id=viewer OR p.visibility='public' OR
    (p.visibility='followers' AND EXISTS(SELECT 1 FROM follows f
     WHERE f.follower_id=viewer AND f.followed_id=p.author_id AND f.status='accepted')))
 );
$$;
INSERT INTO schema_migrations(version) VALUES(1);
COMMIT;
