-- Up Migration

CREATE TABLE suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  customer_id uuid REFERENCES customers (id),
  reason suppression_reason NOT NULL,
  source_message_id uuid REFERENCES email_messages (id),
  suppressed_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppressions_customer_id ON suppressions (customer_id);

CREATE TRIGGER set_suppressions_updated_at
  BEFORE UPDATE ON suppressions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS suppressions;
