BEGIN;
ALTER TABLE events ADD COLUMN ticket_price_cents integer
  CHECK (ticket_price_cents BETWEEN 50 AND 99999999);
CREATE TABLE ticket_holds (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(event_id,buyer_id)
);
CREATE INDEX ticket_holds_expiry ON ticket_holds(event_id,expires_at);
COMMIT;
