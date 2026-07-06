import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';

loadEnv();

const TEMPLATE_CATEGORIES = [
  'Quotation',
  'Follow-up',
  'Invoice',
  'Reminder',
  'Welcome',
  'Payment Reminder',
  'Thank You',
];

const DEFAULT_SETTINGS: Record<string, unknown> = {
  tracking_domain: {
    domain: process.env.TRACKING_DOMAIN ?? 'track.example.com',
  },
  retention: { raw_events_days: 180, pii_days: 730 },
  compliance: { physical_address: '' },
  feature_flags: {},
};

async function seedTemplateCategories(client: Client): Promise<void> {
  for (const name of TEMPLATE_CATEGORIES) {
    await client.query(
      `INSERT INTO template_categories (name) VALUES ($1)
       ON CONFLICT (name) DO NOTHING`,
      [name],
    );
  }
  console.log(`Seeded ${TEMPLATE_CATEGORIES.length} template categories.`);
}

async function seedSettings(client: Client): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await client.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [key, JSON.stringify(value)],
    );
  }
  console.log(`Seeded ${Object.keys(DEFAULT_SETTINGS).length} settings.`);
}

async function seedAdminUser(client: Client): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const { rows: existing } = await client.query(
    `SELECT id FROM users WHERE email = $1`,
    [email],
  );
  if (existing.length > 0) {
    console.log(`Admin user ${email} already exists, skipping.`);
    return;
  }

  const generatedPassword = randomBytes(18).toString('base64url');
  const password = process.env.SEED_ADMIN_PASSWORD ?? generatedPassword;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await client.query(
    `INSERT INTO users (email, name, password_hash, role)
     VALUES ($1, $2, $3, 'admin')`,
    [email, 'Admin', passwordHash],
  );

  console.log(`Seeded admin user ${email}.`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`Generated admin password (shown once): ${password}`);
  }
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await seedTemplateCategories(client);
    await seedSettings(client);
    await seedAdminUser(client);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
