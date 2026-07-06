const { addUpdatedAtTrigger } = require('../lib/migration-helpers');

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('inbound_messages', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    sender_account_id: {
      type: 'uuid',
      notNull: true,
      references: 'sender_accounts',
      onDelete: 'CASCADE',
    },
    imap_uid: { type: 'bigint', notNull: true },
    message_id_header: { type: 'text' },
    in_reply_to: { type: 'text' },
    references_header: { type: 'text' },
    from_email: { type: 'citext' },
    subject: { type: 'text' },
    received_at: { type: 'timestamptz' },
    classification: { type: 'inbound_classification', notNull: true, default: 'other' },
    matched_message_id: { type: 'uuid', references: 'email_messages', onDelete: 'SET NULL' },
    raw_headers: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('inbound_messages', 'inbound_messages_account_uid_unique', {
    unique: ['sender_account_id', 'imap_uid'],
  });
  addUpdatedAtTrigger(pgm, 'inbound_messages');

  pgm.createTable('bounces', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    message_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      references: 'email_messages',
      onDelete: 'CASCADE',
    },
    inbound_message_id: {
      type: 'uuid',
      notNull: true,
      references: 'inbound_messages',
      onDelete: 'CASCADE',
    },
    bounce_class: { type: 'bounce_class', notNull: true },
    status_code: { type: 'text' },
    diagnostic: { type: 'text' },
    bounced_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  addUpdatedAtTrigger(pgm, 'bounces');

  pgm.createTable('suppressions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'citext', notNull: true, unique: true },
    customer_id: { type: 'uuid', references: 'customers', onDelete: 'SET NULL' },
    reason: { type: 'suppression_reason', notNull: true },
    source_message_id: { type: 'uuid', references: 'email_messages', onDelete: 'SET NULL' },
    suppressed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    released_at: { type: 'timestamptz' },
    released_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  addUpdatedAtTrigger(pgm, 'suppressions');
};

exports.down = (pgm) => {
  pgm.dropTable('suppressions');
  pgm.dropTable('bounces');
  pgm.dropTable('inbound_messages');
};
