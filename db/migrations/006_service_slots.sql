BEGIN;
CREATE TABLE service_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES service_listings(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  customer_id uuid REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid UNIQUE,
  confirmed boolean NOT NULL DEFAULT false,
  CHECK (starts_at = date_trunc('hour', starts_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
  CHECK ((customer_id IS NULL) = (request_id IS NULL)),
  CHECK (NOT confirmed OR customer_id IS NOT NULL),
  CHECK (customer_id <> provider_id),
  UNIQUE(provider_id, starts_at),
  UNIQUE(customer_id, starts_at)
);
CREATE INDEX service_slots_listing ON service_slots(listing_id, starts_at);
COMMIT;
