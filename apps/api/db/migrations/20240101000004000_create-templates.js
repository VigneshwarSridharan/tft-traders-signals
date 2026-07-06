const { addUpdatedAtTrigger } = require('../lib/migration-helpers');

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('template_categories', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true, unique: true },
    // FK to email_templates added below once that table exists (circular reference).
    default_template_id: { type: 'uuid' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  addUpdatedAtTrigger(pgm, 'template_categories');

  pgm.createTable('email_templates', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    category_id: {
      type: 'uuid',
      notNull: true,
      references: 'template_categories',
      onDelete: 'RESTRICT',
    },
    name: { type: 'text', notNull: true },
    status: { type: 'template_status', notNull: true, default: 'draft' },
    // FK to template_versions added below once that table exists (circular reference).
    current_version_id: { type: 'uuid' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    deleted_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('email_templates', 'category_id');
  addUpdatedAtTrigger(pgm, 'email_templates');

  // Immutable snapshots — no updated_at, matching the append-only tables.
  pgm.createTable('template_versions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    template_id: {
      type: 'uuid',
      notNull: true,
      references: 'email_templates',
      onDelete: 'CASCADE',
    },
    version_no: { type: 'integer', notNull: true },
    subject: { type: 'text', notNull: true },
    body_html: { type: 'text', notNull: true },
    body_text: { type: 'text' },
    placeholders: { type: 'text[]', notNull: true, default: pgm.func("'{}'::text[]") },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('template_versions', 'template_versions_template_id_version_no_unique', {
    unique: ['template_id', 'version_no'],
  });

  pgm.addConstraint('template_categories', 'template_categories_default_template_id_fkey', {
    foreignKeys: {
      columns: 'default_template_id',
      references: 'email_templates(id)',
      onDelete: 'SET NULL',
    },
  });
  pgm.addConstraint('email_templates', 'email_templates_current_version_id_fkey', {
    foreignKeys: {
      columns: 'current_version_id',
      references: 'template_versions(id)',
      onDelete: 'SET NULL',
    },
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('email_templates', 'email_templates_current_version_id_fkey');
  pgm.dropConstraint('template_categories', 'template_categories_default_template_id_fkey');
  pgm.dropTable('template_versions');
  pgm.dropTable('email_templates');
  pgm.dropTable('template_categories');
};
