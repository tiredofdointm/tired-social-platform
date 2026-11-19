BEGIN;
ALTER TABLE service_slots ADD COLUMN booking_environment text
 CHECK (booking_environment IN ('test','live'));
UPDATE service_slots SET booking_environment='test' WHERE quoted_service_cents IS NOT NULL;
CREATE TABLE live_provider_connect_accounts (LIKE provider_connect_accounts INCLUDING ALL);
ALTER TABLE live_provider_connect_accounts ADD FOREIGN KEY(provider_id) REFERENCES users(id);
CREATE TABLE live_booking_payments (LIKE booking_payments INCLUDING ALL);
ALTER TABLE live_booking_payments ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE live_booking_payments ADD CONSTRAINT approved_platform_fee
 CHECK (fee_cents = (service_cents::bigint * 750 + 5000) / 10000);
COMMIT;
