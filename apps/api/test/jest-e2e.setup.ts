process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.TRACKING_DOMAIN ??= 'track.test.local';
process.env.APP_ENCRYPTION_KEY ??=
  'test-encryption-key-please-override-32chars';
process.env.WEB_APP_URL ??= 'http://localhost:3001';
