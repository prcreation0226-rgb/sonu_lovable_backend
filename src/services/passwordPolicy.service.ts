// Radiantilyk EMR — Shared Password Policy & HIBP Pwned Passwords Integration
// Serves R-32 requirement: Server-side password complexity rules & Have I Been Pwned (HIBP) k-Anonymity breach check.
//
// SECURITY & COMPLIANCE GUARDRAILS:
// 1. Minimum Length: 10 characters.
// 2. Character Diversity: Requires uppercase, lowercase, digit, and special character.
// 3. Reject Common Weak Passwords: List of top dictionary / common passwords rejected locally.
// 4. HIBP k-Anonymity Breach Check:
//    - Computes SHA-1 hash locally on backend.
//    - Sends ONLY the first 5 characters (prefix) over HTTPS to https://api.pwnedpasswords.com/range/{prefix}.
//    - Compares suffix locally against returned hash list.
//    - Plaintext password or full SHA-1 hash is NEVER transmitted or logged.
//    - No HIBP API key required.
// 5. Fail-Safe Handling: If HIBP API network fails or times out, logs warning and enforces local complexity rules without crashing.

import crypto from 'crypto';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const COMMON_WEAK_PASSWORDS = [
  'password', 'password123', 'admin123', 'welcome123', 'radiant123',
  'letmein123', 'qwerty1234', '1234567890', 'change_me1', 'pass123456',
  'administrator', 'clinic1234', 'doctor1234', 'patient123',
];

export class PasswordPolicyService {
  /**
   * Validate candidate password against complexity rules and HIBP breach database.
   * Throws 400 Bad Request if validation fails.
   */
  static async validatePassword(password: string): Promise<void> {
    // 1. Basic type and length check
    if (!password || typeof password !== 'string') {
      throw AppError.badRequest('Password is required.');
    }

    if (password.length < 10) {
      throw AppError.badRequest('Password must be at least 10 characters long.');
    }

    if (password.length > 128) {
      throw AppError.badRequest('Password must not exceed 128 characters.');
    }

    // 2. Character Diversity Checks
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password);

    if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
      throw AppError.badRequest(
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.'
      );
    }

    // 3. Common Weak Password Check
    const normalized = password.toLowerCase().trim();
    const isWeak = COMMON_WEAK_PASSWORDS.some((weak) => normalized.includes(weak));
    if (isWeak) {
      throw AppError.badRequest(
        'Password contains common dictionary terms or weak sequences. Please choose a more secure password.'
      );
    }

    // 4. Have I Been Pwned (HIBP) k-Anonymity Breach Check
    await this.checkHibpPwnedPassword(password);
  }

  /**
   * Check password against Have I Been Pwned (HIBP) Pwned Passwords range API using k-Anonymity.
   */
  private static async checkHibpPwnedPassword(password: string): Promise<void> {
    try {
      // Step A: Compute SHA-1 hash locally on backend
      const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();

      // Step B: Extract 5-character prefix and remaining suffix
      const prefix = sha1.substring(0, 5);
      const suffix = sha1.substring(5);

      // Step C: Query HIBP Range API with prefix ONLY over HTTPS
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s timeout

      const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'RadiantilykEMR-PasswordSecurityCheck',
        },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        logger.warn(`[HIBP_CHECK] HIBP Range API responded with status ${response.status}. Enforcing fail-closed policy.`);
        throw new AppError('Password security verification service is temporarily unavailable. Please try again in a moment.', 503);
      }

      const responseText = await response.text();

      // Step D: Search for matching suffix locally line by line
      const lines = responseText.split('\n');
      for (const line of lines) {
        const [returnedSuffix, countStr] = line.trim().split(':');
        if (returnedSuffix === suffix) {
          const count = parseInt(countStr || '0', 10);
          if (count > 0) {
            logger.warn(`[HIBP_CHECK] Rejected compromised password found in HIBP database (${count} breaches).`);
            throw AppError.badRequest(
              'This password has appeared in a known data breach (Have I Been Pwned). Please choose a stronger, unique password.'
            );
          }
        }
      }
    } catch (err: any) {
      // Re-throw AppError (validation failures or 503 fail-closed) directly
      if (err instanceof AppError) {
        throw err;
      }
      // Enforce fail-closed security policy on network failure or timeout
      logger.warn(`[HIBP_CHECK] HIBP range lookup error/timeout (${err?.name}: ${err?.message}). Enforcing fail-closed policy.`);
      throw new AppError('Password security verification service is temporarily unavailable. Please try again in a moment.', 503);
    }

  }
}
