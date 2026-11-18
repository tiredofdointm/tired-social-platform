BEGIN;
ALTER TABLE service_slots ADD COLUMN payment_locked boolean NOT NULL DEFAULT false;
ALTER TABLE service_slots ADD CONSTRAINT service_slots_payment_requires_quote
 CHECK (NOT payment_locked OR (confirmed AND quoted_service_cents IS NOT NULL));
CREATE TABLE booking_payments (
 request_id uuid PRIMARY KEY,
 destination_account text NOT NULL,
 service_cents integer NOT NULL CHECK(service_cents >= 50),
 fee_cents integer NOT NULL CHECK(fee_cents >= 0),
 expires_at timestamptz NOT NULL,
 session_id text UNIQUE,
 payment_id text UNIQUE,
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','paid','expired','refunded')),
 refunded_cents integer NOT NULL DEFAULT 0 CHECK(refunded_cents BETWEEN 0 AND service_cents + fee_cents)
);
COMMIT;
