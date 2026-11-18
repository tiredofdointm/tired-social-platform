BEGIN;
ALTER TABLE ticket_holds ADD COLUMN attempt_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE TABLE ticket_orders (
 id uuid PRIMARY KEY,
 event_id uuid NOT NULL REFERENCES events(id),
 buyer_id uuid NOT NULL REFERENCES users(id),
 amount integer NOT NULL CHECK (amount >= 50),
 session_id text UNIQUE NOT NULL,
 payment_id text UNIQUE,
 state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','issued','expired','refunded')),
 refunded integer NOT NULL DEFAULT 0 CHECK (refunded BETWEEN 0 AND amount)
);
CREATE UNIQUE INDEX ticket_orders_active ON ticket_orders(event_id,buyer_id) WHERE state IN ('open','issued');
COMMIT;
