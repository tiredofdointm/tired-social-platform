BEGIN;
ALTER TABLE ticket_orders ADD COLUMN checked_in_at timestamptz;
CREATE INDEX ticket_orders_event ON ticket_orders(event_id);
COMMIT;
