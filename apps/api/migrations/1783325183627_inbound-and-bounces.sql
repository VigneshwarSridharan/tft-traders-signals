-- Up Migration

CREATE TABLE inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_account_id uuid NOT NULL REFERENCES sender_accounts (id),
  imap_uid bigint NOT NULL,
  message_id_header text,
  in_reply_to text,
  references_header text,
  from_email citext,
  subject text,
  received_at timestamptz,
  classification inbound_classification NOT NULL DEFAULT 'other',
  matched_message_id uuid REFERENCES email_messages (id),
  raw_headers jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_account_id, imap_uid)
);

CREATE INDEX idx_inbound_messages_matched_message_id ON inbound_messages (matched_message_id);
CREATE INDEX idx_inbound_messages_message_id_header ON inbound_messages (message_id_header);

CREATE TRIGGER set_inbound_messages_updated_at
  BEFORE UPDATE ON inbound_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE bounces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES email_messages (id),
  inbound_message_id uuid REFERENCES inbound_messages (id),
  bounce_class bounce_class NOT NULL,
  status_code text,
  diagnostic text,
  bounced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_bounces_updated_at
  BEFORE UPDATE ON bounces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS bounces;
DROP TABLE IF EXISTS inbound_messages;
