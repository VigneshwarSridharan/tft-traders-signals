-- Up Migration

-- Scheduled/emailed periodic reports (v2 backlog item): a subscription
-- re-generates a Task 22 report (analytics PDF or sent-mail export) on a
-- cadence and emails it as an attachment through the owning sender account.
CREATE TYPE report_subscription_kind AS ENUM ('analytics_pdf', 'sent_mail');
CREATE TYPE report_subscription_format AS ENUM ('pdf', 'csv', 'xlsx');
CREATE TYPE report_subscription_cadence AS ENUM ('daily', 'weekly', 'monthly');

CREATE TABLE report_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL,
  kind report_subscription_kind NOT NULL,
  format report_subscription_format NOT NULL,
  filter_params jsonb NOT NULL DEFAULT '{}',
  cadence report_subscription_cadence NOT NULL,
  hour_of_day int NOT NULL DEFAULT 8 CHECK (hour_of_day BETWEEN 0 AND 23),
  -- 0 = Sunday, only meaningful (and required) for cadence = 'weekly'.
  day_of_week int CHECK (day_of_week BETWEEN 0 AND 6),
  -- Capped at 28 so every month has that day, only meaningful for 'monthly'.
  day_of_month int CHECK (day_of_month BETWEEN 1 AND 28),
  recipient_emails text[] NOT NULL,
  sender_account_id uuid NOT NULL REFERENCES sender_accounts (id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  last_run_error text,
  next_run_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_subscriptions_recipients_not_empty CHECK (array_length(recipient_emails, 1) > 0),
  CONSTRAINT report_subscriptions_weekly_has_day CHECK (cadence != 'weekly' OR day_of_week IS NOT NULL),
  CONSTRAINT report_subscriptions_monthly_has_day CHECK (cadence != 'monthly' OR day_of_month IS NOT NULL)
);

CREATE INDEX idx_report_subscriptions_due ON report_subscriptions (next_run_at) WHERE is_active;
CREATE INDEX idx_report_subscriptions_created_by ON report_subscriptions (created_by);

CREATE TRIGGER set_report_subscriptions_updated_at
  BEFORE UPDATE ON report_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS report_subscriptions;
DROP TYPE IF EXISTS report_subscription_cadence;
DROP TYPE IF EXISTS report_subscription_format;
DROP TYPE IF EXISTS report_subscription_kind;
