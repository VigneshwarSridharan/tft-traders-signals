const { addUpdatedAtTrigger } = require('../lib/migration-helpers');

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('tags', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true, unique: true },
    color: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  addUpdatedAtTrigger(pgm, 'tags');

  pgm.createTable(
    'taggings',
    {
      tag_id: { type: 'uuid', notNull: true, references: 'tags', onDelete: 'CASCADE' },
      entity_type: { type: 'taggable_entity_type', notNull: true },
      entity_id: { type: 'uuid', notNull: true },
    },
    { constraints: { primaryKey: ['tag_id', 'entity_type', 'entity_id'] } },
  );
  pgm.createIndex('taggings', ['entity_type', 'entity_id']);

  pgm.createTable('notifications', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    type: { type: 'notification_type', notNull: true },
    message_id: { type: 'uuid', references: 'email_messages', onDelete: 'SET NULL' },
    title: { type: 'text', notNull: true },
    body: { type: 'text' },
    read_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('notifications', ['user_id', { name: 'created_at', sort: 'DESC' }]);
  addUpdatedAtTrigger(pgm, 'notifications');

  pgm.createTable('webhook_endpoints', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    url: { type: 'text', notNull: true },
    secret_enc: { type: 'bytea', notNull: true },
    events: { type: 'text[]', notNull: true, default: pgm.func("'{}'::text[]") },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  addUpdatedAtTrigger(pgm, 'webhook_endpoints');

  pgm.createTable('webhook_deliveries', {
    id: { type: 'bigint', primaryKey: true, generatedAlways: true, sequenceGenerated: { precedence: 'ALWAYS' } },
    endpoint_id: {
      type: 'uuid',
      notNull: true,
      references: 'webhook_endpoints',
      onDelete: 'CASCADE',
    },
    event_type: { type: 'text', notNull: true },
    payload: { type: 'jsonb', notNull: true },
    attempt: { type: 'integer', notNull: true, default: 1 },
    response_status: { type: 'integer' },
    delivered_at: { type: 'timestamptz' },
    next_retry_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('webhook_deliveries', ['endpoint_id', { name: 'created_at', sort: 'DESC' }]);

  pgm.createTable(
    'settings',
    {
      key: { type: 'text', primaryKey: true },
      value: { type: 'jsonb', notNull: true },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { id: false },
  );
  addUpdatedAtTrigger(pgm, 'settings');
};

exports.down = (pgm) => {
  pgm.dropTable('settings');
  pgm.dropTable('webhook_deliveries');
  pgm.dropTable('webhook_endpoints');
  pgm.dropTable('notifications');
  pgm.dropTable('taggings');
  pgm.dropTable('tags');
};
