-- Up Migration

-- Task 18: per-send follow-up reminders (FR-8.7) fire an in-app notification
-- of this new type once a message's reminder rule elapses with no reply/open.
ALTER TYPE notification_type ADD VALUE 'follow_up_due';

-- Reply threading (symmetric with inbound_messages.in_reply_to /
-- references_header) plus the per-send follow-up rule itself.
ALTER TABLE email_messages
  ADD COLUMN parent_message_id uuid REFERENCES email_messages (id),
  ADD COLUMN in_reply_to_header text,
  ADD COLUMN references_header text,
  ADD COLUMN follow_up_days int,
  ADD COLUMN follow_up_notified_at timestamptz;

CREATE INDEX idx_email_messages_parent_message_id ON email_messages (parent_message_id)
  WHERE parent_message_id IS NOT NULL;

-- Drives the follow-up-reminder scheduled job's due-message scan.
CREATE INDEX idx_email_messages_follow_up_pending ON email_messages (sent_at)
  WHERE follow_up_days IS NOT NULL AND follow_up_notified_at IS NULL;

-- Down Migration

DROP INDEX IF EXISTS idx_email_messages_follow_up_pending;
DROP INDEX IF EXISTS idx_email_messages_parent_message_id;

ALTER TABLE email_messages
  DROP COLUMN IF EXISTS follow_up_notified_at,
  DROP COLUMN IF EXISTS follow_up_days,
  DROP COLUMN IF EXISTS references_header,
  DROP COLUMN IF EXISTS in_reply_to_header,
  DROP COLUMN IF EXISTS parent_message_id;

-- Postgres has no ALTER TYPE ... DROP VALUE, so removing the enum value we
-- added means recreating the type without it. Any rows using it must go
-- first or the USING cast below fails.
DELETE FROM notifications WHERE type = 'follow_up_due';

ALTER TYPE notification_type RENAME TO notification_type_old;
CREATE TYPE notification_type AS ENUM ('first_open', 'click', 'reply', 'bounce', 'send_failed', 'quota_warning');
ALTER TABLE notifications ALTER COLUMN type TYPE notification_type USING type::text::notification_type;
DROP TYPE notification_type_old;
