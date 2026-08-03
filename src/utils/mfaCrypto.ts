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
 * AES-256-GCM Encryption for MFA Secrets & Challenge Tokens
 */
export function encryptMfaSecret(plaintext: string): string {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv.authTag.encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * AES-256-GCM Decryption for MFA Secrets & Challenge Tokens
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
 * Hash recovery code or sensitive token using SHA-256
 */
export function hashRecoveryCode(code: string): string {
  const sanitized = code.replace(/[\s-]/g, '').toUpperCase();
  return crypto.createHash('sha256').update(sanitized).digest('hex');
}

/**
 * Compare plain recovery code against SHA-256 hash
 */
export function verifyRecoveryCodeHash(plainCode: string, codeHash: string): boolean {
  const computedHash = hashRecoveryCode(plainCode);
  return crypto.timingSafeEqual(Buffer.from(computedHash), Buffer.from(codeHash));
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
 * Generate secure random challenge token
 */
export function generateChallengeToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
