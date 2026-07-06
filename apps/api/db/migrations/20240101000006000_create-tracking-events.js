const { addUpdatedAtTrigger } = require('../lib/migration-helpers');

exports.shorthands = undefined;

// tracking_events is append-only and partitioned by RANGE (occurred_at), one
// partition per month, per ERD §2.6. Partitioned tables require the
// partition key in the primary key, hence the composite (id, occurred_at) PK
// instead of a bare `id` PK.
//
// `create_tracking_events_partition(month)` creates the partition for the
// calendar month containing `month` if it doesn't already exist, so the
// bootstrap below (and any later scheduled job — see Task 24) can call it
// idempotently ahead of time. A DEFAULT partition catches any writes outside
// the pre-created range so inserts never fail outright while that job is not
// yet wired up.
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE tracking_events (
      id bigint GENERATED ALWAYS AS IDENTITY,
      message_id uuid NOT NULL REFERENCES email_messages (id) ON DELETE CASCADE,
      link_id uuid REFERENCES email_links (id) ON DELETE SET NULL,
      event_type tracking_event_type NOT NULL,
      occurred_at timestamptz NOT NULL DEFAULT now(),
      ip inet,
      user_agent text,
      device_type text,
      os text,
      browser text,
      geo_country text,
      geo_city text,
      is_bot boolean NOT NULL DEFAULT false,
      is_proxy boolean NOT NULL DEFAULT false,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (id, occurred_at)
    ) PARTITION BY RANGE (occurred_at);
  `);

  pgm.createIndex('tracking_events', ['message_id', 'occurred_at']);
  pgm.createIndex('tracking_events', ['event_type', 'occurred_at']);
  pgm.createIndex('tracking_events', 'link_id', { where: 'link_id IS NOT NULL' });

  pgm.sql(`
    CREATE FUNCTION create_tracking_events_partition(for_month date)
    RETURNS void AS $$
    DECLARE
      partition_start date := date_trunc('month', for_month);
      partition_end date := partition_start + interval '1 month';
      partition_name text := 'tracking_events_' || to_char(partition_start, 'YYYY_MM');
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
        EXECUTE format(
          'CREATE TABLE %I PARTITION OF tracking_events FOR VALUES FROM (%L) TO (%L);',
          partition_name, partition_start, partition_end
        );
      END IF;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TABLE tracking_events_default PARTITION OF tracking_events DEFAULT;
  `);

  pgm.sql(`
    DO $$
    DECLARE
      offset_months int;
    BEGIN
      FOR offset_months IN -3..3 LOOP
        PERFORM create_tracking_events_partition(
          (date_trunc('month', now()) + make_interval(months => offset_months))::date
        );
      END LOOP;
    END;
    $$;
  `);

  // Rollup for fast analytics (ERD §2.6). A composite PK with nullable
  // dimension columns (day, sender_account_id, template_id — null meaning
  // "all") isn't representable directly since primary key columns are
  // implicitly NOT NULL, so a surrogate bigint id is used instead, with the
  // ERD's intended uniqueness enforced via a COALESCE-to-sentinel unique
  // index (nulls otherwise compare as distinct under a plain UNIQUE index).
  pgm.createTable('daily_stats', {
    id: { type: 'bigint', primaryKey: true, generatedAlways: true, sequenceGenerated: { precedence: 'ALWAYS' } },
    day: { type: 'date', notNull: true },
    sender_account_id: { type: 'uuid', references: 'sender_accounts', onDelete: 'CASCADE' },
    template_id: { type: 'uuid', references: 'email_templates', onDelete: 'CASCADE' },
    sent: { type: 'integer', notNull: true, default: 0 },
    delivered: { type: 'integer', notNull: true, default: 0 },
    bounced_hard: { type: 'integer', notNull: true, default: 0 },
    bounced_soft: { type: 'integer', notNull: true, default: 0 },
    opens_total: { type: 'integer', notNull: true, default: 0 },
    opens_unique: { type: 'integer', notNull: true, default: 0 },
    clicks_total: { type: 'integer', notNull: true, default: 0 },
    clicks_unique: { type: 'integer', notNull: true, default: 0 },
    replies: { type: 'integer', notNull: true, default: 0 },
    unsubscribes: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.sql(`
    CREATE UNIQUE INDEX daily_stats_unique_key ON daily_stats (
      day,
      COALESCE(sender_account_id, '00000000-0000-0000-0000-000000000000'),
      COALESCE(template_id, '00000000-0000-0000-0000-000000000000')
    );
  `);
  addUpdatedAtTrigger(pgm, 'daily_stats');
};

exports.down = (pgm) => {
  pgm.dropTable('daily_stats');
  pgm.dropTable('tracking_events', { cascade: true });
  pgm.sql('DROP FUNCTION IF EXISTS create_tracking_events_partition(date);');
};
