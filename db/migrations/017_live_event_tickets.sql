BEGIN;
ALTER TABLE events ADD COLUMN live_ticket boolean NOT NULL DEFAULT false;
ALTER TABLE events ADD CONSTRAINT live_ticket_requires_price CHECK (NOT live_ticket OR ticket_price_cents IS NOT NULL);
ALTER TABLE ticket_orders ADD COLUMN organizer_amount integer;
ALTER TABLE ticket_orders ADD COLUMN destination_account text;
ALTER TABLE ticket_orders ADD CONSTRAINT live_ticket_quote CHECK (
 (organizer_amount IS NULL AND destination_account IS NULL) OR
 (organizer_amount IS NOT NULL AND organizer_amount >= 50 AND destination_account IS NOT NULL AND
 amount = organizer_amount + (organizer_amount::bigint * 750 + 5000) / 10000));
COMMIT;
