process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.SHOPIFY_API_KEY = 'test_key';
process.env.SHOPIFY_API_SECRET = 'test_secret';
process.env.SHOPIFY_APP_URL = 'https://example.test';
process.env.SHOPIFY_SCOPES = 'read_products';
process.env.DATABASE_URL = 'postgresql://app:app@localhost:5432/ci?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SESSION_SECRET =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
