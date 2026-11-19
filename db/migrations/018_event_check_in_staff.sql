BEGIN;
CREATE TABLE event_check_in_staff (
 event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 PRIMARY KEY(event_id,user_id)
);
CREATE TABLE event_staff_changes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 event_id uuid NOT NULL REFERENCES events(id),
 user_id uuid NOT NULL REFERENCES users(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 granted boolean NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ticket_orders ADD COLUMN checked_in_by uuid REFERENCES users(id);
COMMIT;
