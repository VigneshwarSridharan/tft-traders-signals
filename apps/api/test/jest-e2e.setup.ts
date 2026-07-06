process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.TRACKING_DOMAIN ??= 'track.test.local';
process.env.APP_ENCRYPTION_KEY ??=
  'test-encryption-key-please-override-32chars';
process.env.WEB_APP_URL ??= 'http://localhost:3001';
process.env.JWT_ACCESS_SECRET ??=
  'test-jwt-access-secret-please-override-32chars';
process.env.JWT_ACCESS_TTL ??= '15m';
process.env.REFRESH_TOKEN_TTL_DAYS ??= '30';
process.env.INVITATION_TTL_HOURS ??= '72';
process.env.ATTACHMENT_STORAGE_PATH ??= '/tmp/tft-test-attachments';
process.env.SEND_FROM_DOMAIN ??= 'test.local';
