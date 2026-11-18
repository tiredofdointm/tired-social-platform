BEGIN;
ALTER TABLE oauth_login_attempts ADD COLUMN return_page text NOT NULL DEFAULT 'community'
 CHECK (return_page IN ('discover','feed','community','plans','shared-events','talent','studio','settings'));
COMMIT;
