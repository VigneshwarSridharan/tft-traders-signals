const { addUpdatedAtTrigger } = require('../lib/migration-helpers');

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('email_messages', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    public_token: { type: 'text', notNull: true, unique: true },
    sender_account_id: {
      type: 'uuid',
      notNull: true,
      references: 'sender_accounts',
      onDelete: 'RESTRICT',
    },
    customer_id: {
      type: 'uuid',
      notNull: true,
      references: 'customers',
      onDelete: 'RESTRICT',
    },
    template_version_id: {
      type: 'uuid',
      references: 'template_versions',
      onDelete: 'SET NULL',
    },
    sent_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    to_email: { type: 'citext', notNull: true },
    to_name: { type: 'text' },
    subject: { type: 'text', notNull: true },
    body_html_rendered: { type: 'text' },
    body_text_rendered: { type: 'text' },
    message_id_header: { type: 'text', unique: true },
    tracking_enabled: { type: 'boolean', notNull: true, default: true },
    status: { type: 'message_status', notNull: true, default: 'draft' },
    smtp_response: { type: 'text' },
    queued_at: { type: 'timestamptz' },
    sent_at: { type: 'timestamptz' },
    open_count: { type: 'integer', notNull: true, default: 0 },
    unique_open_hint: { type: 'boolean', notNull: true, default: false },
    first_opened_at: { type: 'timestamptz' },
    last_opened_at: { type: 'timestamptz' },
    click_count: { type: 'integer', notNull: true, default: 0 },
    first_clicked_at: { type: 'timestamptz' },
    last_clicked_at: { type: 'timestamptz' },
    replied_at: { type: 'timestamptz' },
    bounce_type: { type: 'bounce_type', notNull: true, default: 'none' },
    unsubscribed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('email_messages', ['sender_account_id', { name: 'sent_at', sort: 'DESC' }]);
  pgm.createIndex('email_messages', ['customer_id', { name: 'sent_at', sort: 'DESC' }]);
  pgm.createIndex('email_messages', 'status');
  pgm.createIndex('email_messages', 'template_version_id');
  pgm.sql(`
    CREATE INDEX email_messages_to_email_subject_trgm_idx
      ON email_messages USING gin (to_email gin_trgm_ops, subject gin_trgm_ops);
  `);
  addUpdatedAtTrigger(pgm, 'email_messages');

  pgm.createTable('email_links', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    message_id: {
      type: 'uuid',
      notNull: true,
      references: 'email_messages',
      onDelete: 'CASCADE',
    },
    token: { type: 'text', notNull: true, unique: true },
    original_url: { type: 'text', notNull: true },
    link_label: { type: 'text' },
    position: { type: 'integer', notNull: true, default: 0 },
    click_count: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('email_links', 'message_id');
  addUpdatedAtTrigger(pgm, 'email_links');

  pgm.createTable('attachments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    message_id: {
      type: 'uuid',
      notNull: true,
      references: 'email_messages',
      onDelete: 'CASCADE',
    },
    filename: { type: 'text', notNull: true },
    content_type: { type: 'text', notNull: true },
    size_bytes: { type: 'bigint', notNull: true },
    storage_path: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('attachments', 'message_id');
  addUpdatedAtTrigger(pgm, 'attachments');

  pgm.createTable('scheduled_sends', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    message_id: {
      type: 'uuid',
      notNull: true,
      unique: true,
      references: 'email_messages',
      onDelete: 'CASCADE',
    },
    scheduled_for: { type: 'timestamptz', notNull: true },
    timezone: { type: 'text', notNull: true, default: 'UTC' },
    job_id: { type: 'text' },
    cancelled_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  addUpdatedAtTrigger(pgm, 'scheduled_sends');
};

exports.down = (pgm) => {
  pgm.dropTable('scheduled_sends');
  pgm.dropTable('attachments');
  pgm.dropTable('email_links');
  pgm.dropTable('email_messages');
};
