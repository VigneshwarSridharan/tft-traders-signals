// Idempotent seed script: template categories, default settings, and the
// first admin user. Safe to re-run — every write is an upsert keyed on a
// natural unique column (category name / settings key / admin email).
require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const argon2 = require('argon2');

const TEMPLATE_CATEGORIES = ['Quotation', 'Follow-up', 'Invoice', 'Introduction', 'Other'];

function defaultSettings() {
  return {
    tracking_domain: process.env.TRACKING_DOMAIN || 'track.yourdomain.com',
    ip_retention_days: 30,
    raw_event_retention_months: 12,
    canspam_physical_address: '',
    feature_flags: {},
  };
}

async function seedTemplateCategories(client) {
  for (const name of TEMPLATE_CATEGORIES) {
    await client.query(
      `INSERT INTO template_categories (name) VALUES ($1)
       ON CONFLICT (name) DO NOTHING`,
      [name],
    );
  }
  console.log(`Seeded ${TEMPLATE_CATEGORIES.length} template categories.`);
}

async function seedSettings(client) {
  const settings = defaultSettings();
  for (const [key, value] of Object.entries(settings)) {
    await client.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, JSON.stringify(value)],
    );
  }
  console.log(`Seeded ${Object.keys(settings).length} settings.`);
}

async function seedAdminUser(client) {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const name = process.env.SEED_ADMIN_NAME || 'Admin';

  const { rows } = await client.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows.length > 0) {
    console.log(`Admin user ${email} already exists, skipping.`);
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await client.query(
    `INSERT INTO users (email, name, password_hash, role)
     VALUES ($1, $2, $3, 'admin')`,
    [email, name, passwordHash],
  );
  console.log(`Seeded admin user ${email}.`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`  (using default password "${password}" — set SEED_ADMIN_PASSWORD to override)`);
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedTemplateCategories(client);
    await seedSettings(client);
    await seedAdminUser(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
