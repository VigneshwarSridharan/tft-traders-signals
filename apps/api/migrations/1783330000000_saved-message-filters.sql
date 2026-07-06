-- Up Migration

CREATE TABLE saved_message_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL,
  filter jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_message_filters_user_id ON saved_message_filters (user_id, created_at ASC);

CREATE TRIGGER set_saved_message_filters_updated_at
  BEFORE UPDATE ON saved_message_filters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS saved_message_filters;
