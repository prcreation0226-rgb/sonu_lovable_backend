// Radiantilyk EMR — AES-256-GCM Encryption Utility
// Used for encrypting MFA secrets and other sensitive column data before database storage.
// Each encryption produces a unique IV for semantic security.

import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Derive a 32-byte key from the ENCRYPTION_KEY environment variable.
 */
function getEncryptionKey(): Buffer {
  const keyHex = env.ENCRYPTION_KEY;
  if (keyHex.length !== 64) {
    throw new Error('[ENCRYPTION FATAL] ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns: iv:authTag:ciphertext (all hex-encoded, colon-separated)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a ciphertext string that was encrypted with encrypt().
 * Input format: iv:authTag:ciphertext (all hex-encoded)
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');

  if (parts.length !== 3) {
    throw new Error('[ENCRYPTION] Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const ciphertext = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Hash a value using SHA-256 (one-way, for audit log prompt/response hashing).
 */
export function hashSha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}
