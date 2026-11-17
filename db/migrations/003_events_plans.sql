BEGIN;
CREATE TABLE events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES users(id),
 title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
 venue text NOT NULL CHECK (length(venue) BETWEEN 1 AND 160),
 starts_at timestamptz NOT NULL,
 capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 10000)
);
CREATE INDEX events_start_idx ON events(starts_at,id);
CREATE TABLE rsvps (
 event_id uuid NOT NULL REFERENCES events(id),
 user_id uuid NOT NULL REFERENCES users(id),
 PRIMARY KEY(event_id,user_id)
);
CREATE TABLE friend_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES users(id),
 title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
 details text NOT NULL CHECK (length(details) BETWEEN 1 AND 1000),
 starts_at timestamptz NOT NULL
);
CREATE INDEX friend_plans_owner_idx ON friend_plans(owner_id,starts_at);
CREATE TABLE friend_plan_members (
 plan_id uuid NOT NULL REFERENCES friend_plans(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id),
 accepted boolean NOT NULL DEFAULT false,
 PRIMARY KEY(plan_id,user_id)
);
CREATE INDEX friend_plan_members_user_idx ON friend_plan_members(user_id);
COMMIT;
