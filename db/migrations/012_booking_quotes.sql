BEGIN;
ALTER TABLE service_slots
 ADD COLUMN quoted_service_cents integer,
 ADD COLUMN quoted_fee_cents integer,
 ADD CONSTRAINT service_slots_quote_valid CHECK (
   (quoted_service_cents IS NULL AND quoted_fee_cents IS NULL) OR
   (confirmed AND quoted_service_cents IS NOT NULL AND quoted_fee_cents IS NOT NULL
     AND quoted_service_cents BETWEEN 50 AND 99999999
     AND quoted_fee_cents BETWEEN 0 AND quoted_service_cents
     AND quoted_service_cents + quoted_fee_cents <= 99999999)
 );
COMMIT;
