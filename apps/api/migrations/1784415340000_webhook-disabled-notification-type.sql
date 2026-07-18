-- Up Migration

-- Postgres requires ALTER TYPE ... ADD VALUE to run outside any other DDL
-- touching the same enum within the same transaction, so this migration
-- only adds the new value and nothing else.
ALTER TYPE notification_type ADD VALUE 'webhook_disabled';

-- Down Migration

-- Postgres has no ALTER TYPE ... DROP VALUE — removing an enum value would
-- require rebuilding the type (rename, recreate, migrate every column that
-- uses it, drop the old type) and rewriting any rows already using
-- 'webhook_disabled'. That's out of scope for a reversible down migration,
-- so this is intentionally a no-op: rolling back leaves the enum value in
-- place (harmless — it's simply unused if this migration is "undone").
