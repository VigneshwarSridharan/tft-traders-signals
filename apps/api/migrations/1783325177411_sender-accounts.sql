-- Up Migration

CREATE TABLE sender_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  display_name text,
  smtp_host text NOT NULL DEFAULT 'smtp.zoho.com',
  smtp_port int NOT NULL DEFAULT 465,
  imap_host text NOT NULL DEFAULT 'imap.zoho.com',
  imap_port int NOT NULL DEFAULT 993,
  credential_enc bytea NOT NULL,
  signature_html text,
  daily_quota int,
  hourly_quota int,
  status sender_account_status NOT NULL DEFAULT 'active',
  last_verified_at timestamptz,
  imap_last_uid bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_sender_accounts_updated_at
  BEFORE UPDATE ON sender_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS sender_accounts;
