exports.shorthands = undefined;

// Enum names mirror the ERD; `bounce_type` (email_messages, includes 'none')
// is kept distinct from `bounce_class` (bounces, hard/soft only) since they
// serve different columns with different domains.
const ENUM_TYPES = {
  user_role: ['admin', 'manager', 'agent', 'viewer'],
  theme_preference: ['system', 'light', 'dark'],
  sender_account_status: ['active', 'disabled', 'auth_failed'],
  custom_field_type: ['text', 'number', 'date', 'url'],
  template_status: ['draft', 'active', 'archived'],
  message_status: [
    'draft',
    'queued',
    'scheduled',
    'sending',
    'sent',
    'delivered',
    'bounced',
    'failed',
    'cancelled',
  ],
  bounce_type: ['none', 'hard', 'soft'],
  bounce_class: ['hard', 'soft'],
  tracking_event_type: [
    'open',
    'open_inferred',
    'click',
    'bounce',
    'reply',
    'unsubscribe',
    'spam_report',
  ],
  inbound_classification: ['bounce_dsn', 'reply', 'other'],
  suppression_reason: [
    'hard_bounce',
    'soft_bounce_repeat',
    'unsubscribe',
    'manual',
    'spam_report',
  ],
  notification_type: [
    'first_open',
    'click',
    'reply',
    'bounce',
    'send_failed',
    'quota_warning',
  ],
  taggable_entity_type: ['customer', 'message', 'template'],
};

exports.up = (pgm) => {
  pgm.createExtension('citext', { ifNotExists: true });
  pgm.createExtension('pg_trgm', { ifNotExists: true });

  for (const [name, values] of Object.entries(ENUM_TYPES)) {
    pgm.createType(name, values);
  }

  pgm.createFunction(
    'set_updated_at',
    [],
    { returns: 'trigger', language: 'plpgsql' },
    `
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
    `,
  );
};

exports.down = (pgm) => {
  pgm.dropFunction('set_updated_at', []);

  for (const name of Object.keys(ENUM_TYPES)) {
    pgm.dropType(name);
  }

  pgm.dropExtension('pg_trgm', { ifExists: true });
  pgm.dropExtension('citext', { ifExists: true });
};
