const { addUpdatedAtTrigger } = require('../lib/migration-helpers');

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'citext', notNull: true, unique: true },
    name: { type: 'text', notNull: true },
    password_hash: { type: 'text', notNull: true },
    role: { type: 'user_role', notNull: true, default: 'agent' },
    totp_secret_enc: { type: 'text' },
    notification_prefs: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    theme: { type: 'theme_preference', notNull: true, default: 'system' },
    is_active: { type: 'boolean', notNull: true, default: true },
    last_login_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  addUpdatedAtTrigger(pgm, 'users');

  pgm.createTable('api_keys', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    name: { type: 'text', notNull: true },
    key_hash: { type: 'text', notNull: true, unique: true },
    scopes: { type: 'text[]', notNull: true, default: pgm.func("'{}'::text[]") },
    last_used_at: { type: 'timestamptz' },
    expires_at: { type: 'timestamptz' },
    revoked_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('api_keys', 'user_id');
  addUpdatedAtTrigger(pgm, 'api_keys');

  pgm.createTable('audit_logs', {
    id: { type: 'bigint', primaryKey: true, generatedAlways: true, sequenceGenerated: { precedence: 'ALWAYS' } },
    user_id: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    action: { type: 'text', notNull: true },
    entity_type: { type: 'text' },
    entity_id: { type: 'uuid' },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    ip: { type: 'inet' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('audit_logs', ['user_id', { name: 'created_at', sort: 'DESC' }]);
  pgm.createIndex('audit_logs', ['entity_type', 'entity_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('audit_logs');
  pgm.dropTable('api_keys');
  pgm.dropTable('users');
};
