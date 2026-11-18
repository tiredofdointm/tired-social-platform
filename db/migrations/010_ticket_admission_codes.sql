BEGIN;
ALTER TABLE ticket_orders ADD COLUMN admission_code uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE ticket_orders ADD CONSTRAINT ticket_orders_admission_code_unique UNIQUE(admission_code);
COMMIT;
