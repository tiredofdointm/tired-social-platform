BEGIN;
CREATE TABLE service_publishing_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  manual_review boolean NOT NULL DEFAULT false
);
INSERT INTO service_publishing_policy DEFAULT VALUES;

CREATE TABLE service_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  category text NOT NULL CHECK (category IN ('Photography', 'DJ', 'Security', 'Other')),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 1000),
  publication text NOT NULL CHECK (publication IN ('published','pending','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  withdrawn_at timestamptz
);
CREATE INDEX service_listings_directory ON service_listings(created_at DESC, id DESC)
  WHERE publication = 'published' AND withdrawn_at IS NULL;
CREATE INDEX service_listings_owner ON service_listings(owner_id, created_at DESC, id DESC);
COMMIT;
