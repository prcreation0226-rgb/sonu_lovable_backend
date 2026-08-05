import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Derive a 32-byte key from MFA_ENCRYPTION_KEY string
 */
function getDerivedKey(): Buffer {
  const secret = env.MFA_ENCRYPTION_KEY || 'default-radiantilyk-mfa-secret-key-32b';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * AES-256-GCM Encryption for TOTP Secrets
 */
export function encryptMfaSecret(plaintext: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * AES-256-GCM Decryption for TOTP Secrets
 */
export function decryptMfaSecret(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }
  
  const [ivHex, authTagHex, encryptedHex] = parts;
  const key = getDerivedKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * HMAC-SHA256 hash for recovery codes using dedicated MFA_RECOVERY_HMAC_SECRET.
 * Input is sanitized (whitespace/dash stripped, uppercased) before hashing.
 */
export function hashRecoveryCode(code: string): string {
  const sanitized = code.replace(/[\s-]/g, '').toUpperCase();
  return crypto
    .createHmac('sha256', env.MFA_RECOVERY_HMAC_SECRET)
    .update(sanitized)
    .digest('hex');
}

/**
 * Constant-time comparison of plain recovery code against HMAC-SHA256 hash.
 */
export function verifyRecoveryCodeHash(plainCode: string, codeHash: string): boolean {
  const computedHash = hashRecoveryCode(plainCode);
  if (computedHash.length !== codeHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(codeHash));
}

/**
 * HMAC-SHA256 hash for pending MFA challenge tokens using dedicated MFA_CHALLENGE_HMAC_SECRET.
 * The raw token is placed ONLY in the HttpOnly cookie. MySQL stores only this hash.
 */
export function hashChallengeToken(rawToken: string): string {
  return crypto
    .createHmac('sha256', env.MFA_CHALLENGE_HMAC_SECRET)
    .update(rawToken)
    .digest('hex');
}

/**
 * Verify a raw challenge token against its stored HMAC-SHA256 hash (constant-time).
 */
export function verifyChallengeTokenHash(rawToken: string, storedHash: string): boolean {
  const computedHash = hashChallengeToken(rawToken);
  if (computedHash.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(storedHash));
}

/**
 * Generate 10 high-entropy recovery codes formatted as XXXX-XXXX
 */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 char hex
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    codes.push(formatted);
  }
  return codes;
}

/**
 * Generate secure random opaque challenge token (64 hex chars = 32 bytes entropy)
 */
export function generateChallengeToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
