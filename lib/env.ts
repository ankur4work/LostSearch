import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  SHOPIFY_API_KEY: z.string().min(1, 'SHOPIFY_API_KEY is required'),
  SHOPIFY_API_SECRET: z.string().min(1, 'SHOPIFY_API_SECRET is required'),
  SHOPIFY_APP_URL: z.string().url('SHOPIFY_APP_URL must be a valid URL'),
  SHOPIFY_SCOPES: z.string().min(1, 'SHOPIFY_SCOPES is required'),

  DATABASE_URL: z.string().url('DATABASE_URL must be a valid connection string'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid connection string'),

  SESSION_SECRET: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'SESSION_SECRET must be 64 hex characters (32 bytes)'),

  // Classification engine thresholds (all tunable at boot).
  CLASSIFY_FUZZY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.35),
  CLASSIFY_SEMANTIC_THRESHOLD: z.coerce.number().min(0).max(1).default(0.72),
  CLASSIFY_LOW_VOLUME_CUTOFF: z.coerce.number().int().positive().default(5),
  CLASSIFY_TYPE3_OCCURRENCE_MIN: z.coerce.number().int().positive().default(10),
  CLASSIFY_REVENUE_BAND_PCT: z.coerce.number().min(0).max(1).default(0.2),
  CLASSIFY_QUERY_EMBEDDING_TTL_DAYS: z.coerce.number().int().positive().default(7),
  CLASSIFY_WINDOW_DAYS: z.coerce.number().int().positive().default(30),
  CLASSIFY_PARALLELISM: z.coerce.number().int().positive().default(50),

  // Email delivery — Resend preferred, SMTP fallback.
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FROM_EMAIL: z.string().email().default('no-reply@searchfailureminer.app'),
  SUPPORT_EMAIL: z.string().email().default('support@searchfailureminer.app'),
  COMPANY_ADDRESS: z.string().default('Search Failure Miner · Bangalore, India'),

  // Analytics (optional self-hosted PostHog).
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().default('https://app.posthog.com'),

  // Billing
  BILLING_TEST_MODE: z.coerce.boolean().default(false),
  GROWTH_PLAN_PRICE_USD: z.coerce.number().positive().default(15),
  GROWTH_PLAN_TRIAL_DAYS: z.coerce.number().int().positive().default(14),

  // Observability & ops (optional at boot so dev works out of the box).
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
  ADMIN_EMAILS: z.string().default(''),
  PRIVACY_CONTACT_EMAIL: z.string().email().default('privacy@searchfailureminer.app'),
  DPA_URL: z.string().url().optional(),

  // Rate limits (Redis token bucket). Tune per environment.
  RATE_LIMIT_MERCHANT_PER_MIN: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_PUBLIC_PER_MIN: z.coerce.number().int().positive().default(30),

  // Dashboard summary cache.
  DASHBOARD_SUMMARY_CACHE_TTL_SEC: z.coerce.number().int().nonnegative().default(60),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return parsed.data;
}

export const env: Env = loadEnv();
