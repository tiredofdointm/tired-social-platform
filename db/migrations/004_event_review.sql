BEGIN;
CREATE TABLE publishing_admins (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE event_publishing_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 manual_review boolean NOT NULL DEFAULT false
);
INSERT INTO event_publishing_policy DEFAULT VALUES;
ALTER TABLE events ADD COLUMN publication text NOT NULL DEFAULT 'published'
 CHECK (publication IN ('published','pending','rejected'));
ALTER TABLE events ADD COLUMN reviewed_by uuid REFERENCES users(id);
ALTER TABLE events ADD COLUMN reviewed_at timestamptz;
COMMIT;
