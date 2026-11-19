BEGIN;
ALTER TABLE profiles ADD COLUMN share_event_attendance boolean NOT NULL DEFAULT false;
COMMIT;
