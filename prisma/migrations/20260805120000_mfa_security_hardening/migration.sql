-- Additive Migration: MFA Security Hardening (Phase 1C-B1)

-- 1. Session table additions
ALTER TABLE `sessions` 
  ADD COLUMN `mfa_verified_at` DATETIME(3) NULL,
  ADD COLUMN `is_revoked` TINYINT(1) NOT NULL DEFAULT 0;

-- 2. MfaFactor table additions
ALTER TABLE `mfa_factors` 
  ADD COLUMN `disabled_at` DATETIME(3) NULL;

-- 3. MfaChallenge table additions & modifications
ALTER TABLE `mfa_challenges` 
  MODIFY COLUMN `challenge_token_encrypted` VARCHAR(500) NULL,
  ADD COLUMN `challenge_token_hash` VARCHAR(500) NULL,
  ADD COLUMN `scope` VARCHAR(30) NOT NULL DEFAULT 'MFA_LOGIN',
  ADD COLUMN `revoked_at` DATETIME(3) NULL;

-- Create unique index on challenge_token_hash
CREATE UNIQUE INDEX `mfa_challenges_challenge_token_hash_key` ON `mfa_challenges`(`challenge_token_hash`);

-- 4. MfaRecoveryCode table additions
ALTER TABLE `mfa_recovery_codes` 
  ADD COLUMN `revoked_at` DATETIME(3) NULL;
