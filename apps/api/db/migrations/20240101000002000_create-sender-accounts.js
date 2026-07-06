const { addUpdatedAtTrigger } = require('../lib/migration-helpers');

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('sender_accounts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'citext', notNull: true, unique: true },
    display_name: { type: 'text' },
    smtp_host: { type: 'text', notNull: true, default: 'smtp.zoho.com' },
    smtp_port: { type: 'integer', notNull: true, default: 465 },
    imap_host: { type: 'text', notNull: true, default: 'imap.zoho.com' },
    imap_port: { type: 'integer', notNull: true, default: 993 },
    credential_enc: { type: 'bytea', notNull: true },
    signature_html: { type: 'text' },
    daily_quota: { type: 'integer', notNull: true, default: 500 },
    hourly_quota: { type: 'integer', notNull: true, default: 100 },
    status: { type: 'sender_account_status', notNull: true, default: 'active' },
    last_verified_at: { type: 'timestamptz' },
    imap_last_uid: { type: 'bigint', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  addUpdatedAtTrigger(pgm, 'sender_accounts');
};

exports.down = (pgm) => {
  pgm.dropTable('sender_accounts');
};
