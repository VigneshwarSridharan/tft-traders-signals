-- Up Migration

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE user_role AS ENUM ('admin', 'manager', 'agent', 'viewer');
CREATE TYPE user_theme AS ENUM ('system', 'light', 'dark');
CREATE TYPE sender_account_status AS ENUM ('active', 'disabled', 'auth_failed');
CREATE TYPE custom_field_type AS ENUM ('text', 'number', 'date', 'url');
CREATE TYPE template_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE message_status AS ENUM ('draft', 'queued', 'scheduled', 'sending', 'sent', 'delivered', 'bounced', 'failed', 'cancelled');
CREATE TYPE bounce_type AS ENUM ('none', 'hard', 'soft');
CREATE TYPE tracking_event_type AS ENUM ('open', 'open_inferred', 'click', 'bounce', 'reply', 'unsubscribe', 'spam_report');
CREATE TYPE inbound_classification AS ENUM ('bounce_dsn', 'reply', 'other');
CREATE TYPE bounce_class AS ENUM ('hard', 'soft');
CREATE TYPE suppression_reason AS ENUM ('hard_bounce', 'soft_bounce_repeat', 'unsubscribe', 'manual', 'spam_report');
CREATE TYPE taggable_entity_type AS ENUM ('customer', 'message', 'template');
CREATE TYPE notification_type AS ENUM ('first_open', 'click', 'reply', 'bounce', 'send_failed', 'quota_warning');

-- Shared trigger to maintain updated_at on every UPDATE.
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Down Migration

DROP FUNCTION IF EXISTS set_updated_at();

DROP TYPE IF EXISTS notification_type;
DROP TYPE IF EXISTS taggable_entity_type;
DROP TYPE IF EXISTS suppression_reason;
DROP TYPE IF EXISTS bounce_class;
DROP TYPE IF EXISTS inbound_classification;
DROP TYPE IF EXISTS tracking_event_type;
DROP TYPE IF EXISTS bounce_type;
DROP TYPE IF EXISTS message_status;
DROP TYPE IF EXISTS template_status;
DROP TYPE IF EXISTS custom_field_type;
DROP TYPE IF EXISTS sender_account_status;
DROP TYPE IF EXISTS user_theme;
DROP TYPE IF EXISTS user_role;

DROP EXTENSION IF EXISTS pg_trgm;
DROP EXTENSION IF EXISTS citext;
DROP EXTENSION IF EXISTS pgcrypto;
