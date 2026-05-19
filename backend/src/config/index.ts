// ============================================================
// Enterprise Calendar Sync — Configuration
// ============================================================
// Centralized config loaded from environment variables.
// NEVER import .env values directly elsewhere — always use this.
// ============================================================

import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`[FATAL] Missing required environment variable: ${key}`);
  }
  return value || '';
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config = {
  // ---- Server ----
  env: optionalEnv('NODE_ENV', 'development'),
  isDev: optionalEnv('NODE_ENV', 'development') === 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(optionalEnv('PORT', '4400'), 10),
  host: optionalEnv('HOST', 'localhost'),
  apiBaseUrl: optionalEnv('API_BASE_URL', 'http://localhost:4400'),

  // ---- Database ----
  // Uses a SEPARATE database called "calendarsync_app"
  // Will NEVER interfere with your existing databases
  database: {
    url: requireEnv('DATABASE_URL'),
  },

  // ---- Redis ----
  // Railway provides REDIS_URL; local dev uses host/port.
  redis: {
    url: process.env.REDIS_URL || undefined,
    host: optionalEnv('REDIS_HOST', 'localhost'),
    port: parseInt(optionalEnv('REDIS_PORT', '6379'), 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  // ---- Encryption ----
  encryption: {
    key: requireEnv('ENCRYPTION_KEY'),
    ivLength: parseInt(optionalEnv('ENCRYPTION_IV_LENGTH', '16'), 10),
    algorithm: 'aes-256-gcm' as const,
  },

  // ---- JWT ----
  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: optionalEnv('JWT_EXPIRES_IN', '24h'),
  },

  session: {
    secret: requireEnv('SESSION_SECRET'),
  },

  // ---- Google OAuth ----
  google: {
    clientId: requireEnv('GOOGLE_CLIENT_ID'),
    clientSecret: requireEnv('GOOGLE_CLIENT_SECRET'),
    redirectUri: optionalEnv('GOOGLE_REDIRECT_URI', 'http://localhost:4400/auth/google/callback'),
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  },

  // ---- Microsoft OAuth ----
  microsoft: {
    clientId: requireEnv('MICROSOFT_CLIENT_ID'),
    clientSecret: requireEnv('MICROSOFT_CLIENT_SECRET'),
    tenantId: optionalEnv('MICROSOFT_TENANT_ID', 'common'),
    redirectUri: optionalEnv('MICROSOFT_REDIRECT_URI', 'http://localhost:4400/auth/microsoft/callback'),
    scopes: [
      'Calendars.ReadWrite',
      'User.Read',
      'Mail.Send',
      'offline_access',
    ],
    authority: `https://login.microsoftonline.com/${optionalEnv('MICROSOFT_TENANT_ID', 'common')}`,
  },

  // ---- Webhooks ----
  webhook: {
    baseUrl: optionalEnv('WEBHOOK_BASE_URL', 'https://your-domain.com'),
    googleUrl: optionalEnv('GOOGLE_WEBHOOK_URL', ''),
    microsoftUrl: optionalEnv('MICROSOFT_WEBHOOK_URL', ''),
  },

  // ---- Security ----
  security: {
    allowedOrigins: optionalEnv('ALLOWED_ORIGINS', 'http://localhost:3000,http://localhost:4400').split(','),
    rateLimitWindowMs: parseInt(optionalEnv('RATE_LIMIT_WINDOW_MS', '900000'), 10),
    rateLimitMaxRequests: parseInt(optionalEnv('RATE_LIMIT_MAX_REQUESTS', '100'), 10),
    bcryptRounds: parseInt(optionalEnv('BCRYPT_SALT_ROUNDS', '12'), 10),
  },

  // ---- Logging ----
  logging: {
    level: optionalEnv('LOG_LEVEL', 'info'),
    format: optionalEnv('LOG_FORMAT', 'pretty'),
  },

  // ---- Admin Dashboard ----
  adminDashboard: {
    url: optionalEnv('ADMIN_DASHBOARD_URL', 'http://localhost:3000'),
  },

  // ---- Sync Settings ----
  sync: {
    maxRetries: 5,
    retryDelayMs: 1000,
    webhookRenewalIntervalMs: 6 * 24 * 60 * 60 * 1000, // 6 days (Google channels expire in 7)
    syncTimeoutMs: 30000,
    maxConcurrentSyncs: 10,
    fingerprintTtlSeconds: 86400, // 24 hours
    deduplicationWindowMs: 5000,  // 5 seconds
  },
} as const;

export type Config = typeof config;
export default config;
