-- Up Migration

CREATE TABLE email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token text UNIQUE NOT NULL,
  sender_account_id uuid NOT NULL REFERENCES sender_accounts (id),
  customer_id uuid NOT NULL REFERENCES customers (id),
  template_version_id uuid REFERENCES template_versions (id),
  sent_by uuid REFERENCES users (id),
  to_email citext NOT NULL,
  to_name text,
  subject text,
  body_html_rendered text,
  body_text_rendered text,
  message_id_header text UNIQUE,
  tracking_enabled boolean NOT NULL DEFAULT true,
  status message_status NOT NULL DEFAULT 'draft',
  smtp_response text,
  queued_at timestamptz,
  sent_at timestamptz,
  open_count int NOT NULL DEFAULT 0,
  unique_open_hint boolean NOT NULL DEFAULT false,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  click_count int NOT NULL DEFAULT 0,
  first_clicked_at timestamptz,
  last_clicked_at timestamptz,
  replied_at timestamptz,
  bounce_type bounce_type NOT NULL DEFAULT 'none',
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_messages_sender_account_sent_at ON email_messages (sender_account_id, sent_at DESC);
CREATE INDEX idx_email_messages_customer_sent_at ON email_messages (customer_id, sent_at DESC);
CREATE INDEX idx_email_messages_status ON email_messages (status);
CREATE INDEX idx_email_messages_template_version_id ON email_messages (template_version_id);
CREATE INDEX idx_email_messages_search_trgm ON email_messages USING gin (to_email gin_trgm_ops, subject gin_trgm_ops);

CREATE TRIGGER set_email_messages_updated_at
  BEFORE UPDATE ON email_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE email_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES email_messages (id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  original_url text NOT NULL,
  link_label text,
  position int,
  click_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_links_message_id ON email_links (message_id);

CREATE TRIGGER set_email_links_updated_at
  BEFORE UPDATE ON email_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES email_messages (id) ON DELETE CASCADE,
  filename text NOT NULL,
  content_type text,
  size_bytes bigint,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachments_message_id ON attachments (message_id);

CREATE TRIGGER set_attachments_updated_at
  BEFORE UPDATE ON attachments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE scheduled_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES email_messages (id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  timezone text,
  job_id text,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_sends_scheduled_for ON scheduled_sends (scheduled_for);

CREATE TRIGGER set_scheduled_sends_updated_at
  BEFORE UPDATE ON scheduled_sends
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS scheduled_sends;
DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS email_links;
DROP TABLE IF EXISTS email_messages;
