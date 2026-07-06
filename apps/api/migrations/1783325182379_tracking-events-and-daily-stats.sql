-- Up Migration

-- Append-only, partitioned monthly on occurred_at so the retention job can
-- drop old months cheaply. The partition key must be part of every unique
-- constraint, hence the composite primary key.
CREATE TABLE tracking_events (
  id bigint GENERATED ALWAYS AS IDENTITY,
  message_id uuid NOT NULL REFERENCES email_messages (id),
  link_id uuid REFERENCES email_links (id),
  event_type tracking_event_type NOT NULL,
  occurred_at timestamptz NOT NULL,
  ip inet,
  user_agent text,
  device_type text,
  os text,
  browser text,
  geo_country text,
  geo_city text,
  is_bot boolean NOT NULL DEFAULT false,
  is_proxy boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

-- Indexes declared on the partitioned parent are automatically created on
-- every partition, including ones created after this migration runs.
CREATE INDEX idx_tracking_events_message_occurred ON tracking_events (message_id, occurred_at);
CREATE INDEX idx_tracking_events_type_occurred ON tracking_events (event_type, occurred_at);
CREATE INDEX idx_tracking_events_link_id ON tracking_events (link_id) WHERE link_id IS NOT NULL;

-- Creates (idempotently) the monthly partition covering `partition_month`.
-- Used here to seed a rolling window and by the future retention/maintenance
-- job to keep creating partitions ahead of time.
CREATE FUNCTION create_tracking_events_partition(partition_month date) RETURNS void AS $$
DECLARE
  start_date date := date_trunc('month', partition_month)::date;
  end_date date := (date_trunc('month', partition_month) + interval '1 month')::date;
  partition_name text := 'tracking_events_' || to_char(start_date, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF tracking_events FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_date, end_date
  );
END;
$$ LANGUAGE plpgsql;

-- Seed a rolling window (previous month through 3 months ahead) so sends
-- and events work immediately after migrating; a scheduled job takes over
-- creating future partitions from here.
DO $$
DECLARE
  offset_months int;
BEGIN
  FOR offset_months IN -1..3 LOOP
    PERFORM create_tracking_events_partition((date_trunc('month', now()) + make_interval(months => offset_months))::date);
  END LOOP;
END;
$$;

-- Safety net: routes any event outside the seeded/maintained range instead
-- of failing the insert outright.
CREATE TABLE tracking_events_default PARTITION OF tracking_events DEFAULT;

CREATE TABLE daily_stats (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  day date NOT NULL,
  sender_account_id uuid REFERENCES sender_accounts (id),
  template_id uuid REFERENCES email_templates (id),
  sent int NOT NULL DEFAULT 0,
  delivered int NOT NULL DEFAULT 0,
  bounced_hard int NOT NULL DEFAULT 0,
  bounced_soft int NOT NULL DEFAULT 0,
  opens_total int NOT NULL DEFAULT 0,
  opens_unique int NOT NULL DEFAULT 0,
  clicks_total int NOT NULL DEFAULT 0,
  clicks_unique int NOT NULL DEFAULT 0,
  replies int NOT NULL DEFAULT 0,
  unsubscribes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- NULL means "all" for that dimension; NULLS NOT DISTINCT makes at most
  -- one such aggregate row exist per day.
  CONSTRAINT uq_daily_stats_dimensions UNIQUE NULLS NOT DISTINCT (day, sender_account_id, template_id)
);

CREATE INDEX idx_daily_stats_day ON daily_stats (day);

CREATE TRIGGER set_daily_stats_updated_at
  BEFORE UPDATE ON daily_stats
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Down Migration

DROP TABLE IF EXISTS daily_stats;
DROP TABLE IF EXISTS tracking_events;
DROP FUNCTION IF EXISTS create_tracking_events_partition(date);
