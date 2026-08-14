// Radiantilyk EMR — PHI Security Sanitizer for Email & SMS (HIPAA §164.514 & §164.312)
// Ensures unredacted Protected Health Information (PHI) is never transmitted via unencrypted/plain SMS/email.
//
// Rules Enforced:
// 1. Prohibited PHI Detection: Rejects text containing clinical diagnoses, SOAP notes, prescription dosages, medical histories, or detailed allergy disclosures.
// 2. HTTPS URL Enforcement: Automatically converts any http:// patient portal links to secure https:// URLs.
// 3. Neutral Notification Pattern: Sensitive details must be replaced with neutral notifications directing patients to log into the secure portal.

import { AppError } from './AppError';

// Regex patterns matching unredacted PHI in notification text
const PHI_PATTERNS = [
  /\b(diagnosis|diagnoses|diagnostic)\b/i,
  /\b(soap note|subjective|objective|assessment|treatment plan)\b/i,
  /\b(medical history|allergies|allergic to|contraindication)\b/i,
  /\b(prescription|dosage|dosage:|units of botox|mg\/ml|lidocaine|epinephrine|retin-a)\b/i,
  /\b(aftercare instructions|post-op instructions|clinical notes)\b/i,
  /\b(pathology|syndrome|disease|infection|complication)\b/i,
];

export class PhiSanitizer {
  /**
   * Check if a string contains unredacted PHI terms.
   */
  static containsUnredactedPhi(text: string): boolean {
    if (!text) return false;
    return PHI_PATTERNS.some((pattern) => pattern.test(text));
  }

  /**
   * Assert that a notification message text contains no PHI.
   * Throws 400 Bad Request if unredacted PHI is detected.
   */
  static assertNoPhi(text: string, channel: 'email' | 'sms'): void {
    if (this.containsUnredactedPhi(text)) {
      throw AppError.badRequest(
        `Unredacted PHI detected in ${channel.toUpperCase()} notification. Sensitive medical data must be delivered via secure portal link.`
      );
    }
  }

  /**
   * Ensure patient links use secure HTTPS protocol only.
   */
  static sanitizeUrl(url: string): string {
    if (!url) return '';
    const trimmed = url.trim();
    if (trimmed.startsWith('http://')) {
      return trimmed.replace(/^http:\/\//i, 'https://');
    }
    return trimmed;
  }
}
