const { addUpdatedAtTrigger } = require('../lib/migration-helpers');

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('customers', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    company: { type: 'text' },
    email: { type: 'citext', notNull: true },
    phone: { type: 'text' },
    notes: { type: 'text' },
    tracking_opt_out: { type: 'boolean', notNull: true, default: false },
    engagement_score: { type: 'integer', notNull: true, default: 0 },
    deleted_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // Partial unique index: an email can be reused once the prior customer
  // holding it has been soft-deleted (erasure/re-import per PRD).
  pgm.createIndex('customers', 'email', {
    name: 'customers_email_unique_active',
    unique: true,
    where: 'deleted_at IS NULL',
  });
  pgm.createIndex('customers', 'deleted_at');
  addUpdatedAtTrigger(pgm, 'customers');

  pgm.createTable('custom_field_defs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    key: { type: 'text', notNull: true, unique: true },
    label: { type: 'text', notNull: true },
    field_type: { type: 'custom_field_type', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  addUpdatedAtTrigger(pgm, 'custom_field_defs');

  pgm.createTable(
    'customer_field_values',
    {
      customer_id: {
        type: 'uuid',
        notNull: true,
        references: 'customers',
        onDelete: 'CASCADE',
      },
      field_def_id: {
        type: 'uuid',
        notNull: true,
        references: 'custom_field_defs',
        onDelete: 'CASCADE',
      },
      value: { type: 'text' },
    },
    { constraints: { primaryKey: ['customer_id', 'field_def_id'] } },
  );
};

exports.down = (pgm) => {
  pgm.dropTable('customer_field_values');
  pgm.dropTable('custom_field_defs');
  pgm.dropTable('customers');
};
