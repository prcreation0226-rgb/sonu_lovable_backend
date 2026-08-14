// Radiantilyk EMR — Centralized Environment Configuration
// All env vars validated at startup. Server refuses to start with missing critical vars.

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[CONFIG FATAL] Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function optionalIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) return fallback;
  return parsed;
}

const isCloudHosted = !!(
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_ENVIRONMENT_NAME ||
  process.env.RAILWAY_STATIC_URL ||
  process.env.RAILWAY_PUBLIC_DOMAIN ||
  (process.env.PORT && process.env.PORT !== '5000')
);
const resolvedNodeEnv = process.env.NODE_ENV === 'production' || isCloudHosted ? 'production' : optionalEnv('NODE_ENV', 'development');

export const env = {
  // Server
  NODE_ENV: resolvedNodeEnv,
  PORT: optionalIntEnv('PORT', 5000),
  API_PREFIX: optionalEnv('API_PREFIX', '/api/v1'),
  IS_PRODUCTION: resolvedNodeEnv === 'production',

  // Database
  DATABASE_URL: requireEnv('DATABASE_URL'),

  // Redis
  REDIS_HOST: optionalEnv('REDIS_HOST', '127.0.0.1'),
  REDIS_PORT: optionalIntEnv('REDIS_PORT', 6379),
  REDIS_PASSWORD: optionalEnv('REDIS_PASSWORD', ''),
  REDIS_TLS_ENABLED: optionalEnv('REDIS_TLS_ENABLED', 'false') === 'true',

  // JWT
  JWT_ACCESS_SECRET: requireEnv('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: requireEnv('JWT_REFRESH_SECRET'),
  JWT_ACCESS_EXPIRES_IN: optionalEnv('JWT_ACCESS_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: optionalEnv('JWT_REFRESH_EXPIRES_IN', '7d'),

  // Refresh Token HMAC (dedicated secret for hashing refresh tokens stored in DB)
  REFRESH_TOKEN_HMAC_SECRET: optionalEnv('REFRESH_TOKEN_HMAC_SECRET', requireEnv('JWT_REFRESH_SECRET')),

  // Encryption
  ENCRYPTION_KEY: requireEnv('ENCRYPTION_KEY'),

  // AWS S3
  AWS_REGION: optionalEnv('AWS_REGION', 'us-west-2'),
  AWS_ACCESS_KEY_ID: optionalEnv('AWS_ACCESS_KEY_ID', ''),
  AWS_SECRET_ACCESS_KEY: optionalEnv('AWS_SECRET_ACCESS_KEY', ''),
  S3_BUCKET_NAME: optionalEnv('S3_BUCKET_NAME', 'radiantilyk-emr-phi'),
  S3_PRESIGNED_EXPIRY_SECONDS: optionalIntEnv('S3_PRESIGNED_EXPIRY_SECONDS', 900),

  // Stripe
  STRIPE_SECRET_KEY: optionalEnv('STRIPE_SECRET_KEY', ''),
  STRIPE_WEBHOOK_SECRET: optionalEnv('STRIPE_WEBHOOK_SECRET', ''),

  // Email
  EMAIL_PROVIDER: optionalEnv('EMAIL_PROVIDER', 'resend'),
  RESEND_API_KEY: optionalEnv('RESEND_API_KEY', ''),
  EMAIL_FROM: optionalEnv('EMAIL_FROM', 'noreply@bookrka.com'),

  // SMS
  TWILIO_ACCOUNT_SID: optionalEnv('TWILIO_ACCOUNT_SID', ''),
  TWILIO_AUTH_TOKEN: optionalEnv('TWILIO_AUTH_TOKEN', ''),
  TWILIO_PHONE_NUMBER: optionalEnv('TWILIO_PHONE_NUMBER', ''),

  // CORS
  CORS_ORIGIN: optionalEnv('CORS_ORIGIN', 'http://localhost:5173'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: optionalIntEnv('RATE_LIMIT_WINDOW_MS', 900000),
  RATE_LIMIT_MAX_REQUESTS: optionalIntEnv('RATE_LIMIT_MAX_REQUESTS', 100),

  // MFA Feature Flags & Encryption
  MFA_ENFORCEMENT_ENABLED: optionalEnv('MFA_ENFORCEMENT_ENABLED', 'true') === 'true',

  MFA_REQUIRED_ROLES: optionalEnv(
    'MFA_REQUIRED_ROLES',
    'admin,nurse_practitioner,medical_director,rn_injector,privacy_officer'
  ).split(',').map((r) => r.trim()).filter(Boolean),
  MFA_ENCRYPTION_KEY: optionalEnv('MFA_ENCRYPTION_KEY', process.env.ENCRYPTION_KEY || 'radiantilyk_mfa_encryption_key_32bytes!'),
  MFA_RECOVERY_HMAC_SECRET: optionalEnv('MFA_RECOVERY_HMAC_SECRET', process.env.JWT_ACCESS_SECRET || 'radiantilyk_mfa_recovery_hmac_secret_32bytes!'),
  MFA_CHALLENGE_HMAC_SECRET: optionalEnv('MFA_CHALLENGE_HMAC_SECRET', process.env.JWT_REFRESH_SECRET || 'radiantilyk_mfa_challenge_hmac_secret_32bytes!'),

  // Logging
  LOG_LEVEL: optionalEnv('LOG_LEVEL', 'debug'),
  LOG_FILE_PATH: optionalEnv('LOG_FILE_PATH', './logs'),
} as const;
