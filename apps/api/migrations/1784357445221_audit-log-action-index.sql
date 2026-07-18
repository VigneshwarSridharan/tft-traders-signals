-- Up Migration

CREATE INDEX idx_audit_logs_action_created_at ON audit_logs (action, created_at DESC);

-- Down Migration

DROP INDEX idx_audit_logs_action_created_at;
