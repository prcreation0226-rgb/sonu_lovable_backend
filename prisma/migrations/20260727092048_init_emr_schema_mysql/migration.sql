-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME NULL,
    `mfa_enabled` BOOLEAN NOT NULL DEFAULT false,
    `mfa_secret` VARCHAR(255) NULL,
    `mfa_grace_period_ends_at` DATETIME NULL,
    `last_login_at` DATETIME NULL,
    `last_login_ip` VARCHAR(45) NULL,
    `failed_attempts` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_email_idx`(`email`),
    INDEX `users_is_active_idx`(`is_active`),
    INDEX `users_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `roles_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `permissions_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` CHAR(36) NOT NULL,
    `permission_id` CHAR(36) NOT NULL,

    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `role_id` CHAR(36) NOT NULL,
    `granted_by` CHAR(36) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_roles_user_id_role_id_key`(`user_id`, `role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `token` VARCHAR(500) NOT NULL,
    `ip_address` VARCHAR(45) NOT NULL,
    `user_agent` TEXT NULL,
    `expires_at` DATETIME NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sessions_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `token` VARCHAR(500) NOT NULL,
    `is_revoked` BOOLEAN NOT NULL DEFAULT false,
    `expires_at` DATETIME NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mfa_configs` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `secret` VARCHAR(255) NOT NULL,
    `is_verified` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME NOT NULL,

    UNIQUE INDEX `mfa_configs_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mfa_recovery_codes` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `code_hash` VARCHAR(255) NOT NULL,
    `used_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_audit_logs` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `email` VARCHAR(255) NOT NULL,
    `event_type` VARCHAR(50) NOT NULL,
    `ip_address` VARCHAR(45) NOT NULL,
    `user_agent` TEXT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `auth_audit_logs_user_id_created_at_idx`(`user_id`, `created_at` DESC),
    INDEX `auth_audit_logs_email_created_at_idx`(`email`, `created_at` DESC),
    INDEX `auth_audit_logs_event_type_created_at_idx`(`event_type`, `created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_histories` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `password_histories_user_id_created_at_idx`(`user_id`, `created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `security_event_logs` (
    `id` CHAR(36) NOT NULL,
    `event_type` VARCHAR(50) NOT NULL,
    `severity` VARCHAR(20) NOT NULL DEFAULT 'medium',
    `source_ip` VARCHAR(45) NOT NULL,
    `user_id` CHAR(36) NULL,
    `description` TEXT NOT NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `security_event_logs_event_type_created_at_idx`(`event_type`, `created_at` DESC),
    INDEX `security_event_logs_source_ip_created_at_idx`(`source_ip`, `created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_profiles` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `full_name` VARCHAR(255) NOT NULL,
    `title` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `color` VARCHAR(7) NOT NULL DEFAULT '#6366f1',
    `npi_number` VARCHAR(10) NULL,
    `license_number` VARCHAR(50) NULL,
    `license_state` VARCHAR(2) NULL,
    `license_expiry` DATE NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME NULL,
    `is_owner` BOOLEAN NOT NULL DEFAULT false,
    `hourly_rate_cents` INTEGER NULL,
    `commission_percent` DECIMAL(5, 2) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME NOT NULL,

    UNIQUE INDEX `staff_profiles_user_id_key`(`user_id`),
    INDEX `staff_profiles_is_active_idx`(`is_active`),
    INDEX `staff_profiles_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `locations` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `address` TEXT NULL,
    `city` VARCHAR(100) NOT NULL,
    `state` VARCHAR(2) NULL,
    `zip_code` VARCHAR(10) NULL,
    `phone` VARCHAR(20) NULL,
    `timezone` VARCHAR(50) NOT NULL DEFAULT 'America/Los_Angeles',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `locations_is_active_idx`(`is_active`),
    INDEX `locations_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_locations` (
    `id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `location_id` CHAR(36) NOT NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `staff_locations_staff_id_location_id_key`(`staff_id`, `location_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `patient_profiles` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `phone` VARCHAR(20) NULL,
    `date_of_birth` DATE NULL,
    `gender` VARCHAR(20) NULL,
    `medical_alerts` TEXT NULL,
    `marketing_consent_at` DATETIME NULL,
    `npp_acknowledged_at` DATETIME NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME NOT NULL,

    UNIQUE INDEX `patient_profiles_user_id_key`(`user_id`),
    INDEX `patient_profiles_email_idx`(`email`),
    INDEX `patient_profiles_last_name_first_name_idx`(`last_name`, `first_name`),
    INDEX `patient_profiles_phone_idx`(`phone`),
    INDEX `patient_profiles_is_active_idx`(`is_active`),
    INDEX `patient_profiles_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `demographics` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `address_line1` VARCHAR(255) NULL,
    `address_line2` VARCHAR(255) NULL,
    `city` VARCHAR(100) NULL,
    `state` VARCHAR(2) NULL,
    `zip_code` VARCHAR(10) NULL,
    `emergency_name` VARCHAR(255) NULL,
    `emergency_phone` VARCHAR(20) NULL,
    `preferred_lang` VARCHAR(50) NOT NULL DEFAULT 'English',
    `ethnicity` VARCHAR(100) NULL,
    `fitzpatrick_type` VARCHAR(10) NULL,
    `insurance_provider` VARCHAR(255) NULL,
    `policy_number` VARCHAR(100) NULL,
    `group_number` VARCHAR(100) NULL,
    `referral_source` VARCHAR(255) NULL,
    `deleted_at` DATETIME NULL,
    `updated_at` DATETIME NOT NULL,

    UNIQUE INDEX `demographics_patient_id_key`(`patient_id`),
    INDEX `demographics_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medical_histories` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `condition` VARCHAR(255) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `diagnosed_date` DATE NULL,
    `notes` TEXT NULL,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `medical_histories_patient_id_idx`(`patient_id`),
    INDEX `medical_histories_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `allergies` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `allergen` VARCHAR(255) NOT NULL,
    `reaction` VARCHAR(255) NULL,
    `severity` VARCHAR(20) NOT NULL DEFAULT 'moderate',
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `allergies_patient_id_idx`(`patient_id`),
    INDEX `allergies_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `medications` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `medication_name` VARCHAR(255) NOT NULL,
    `dosage` VARCHAR(100) NULL,
    `frequency` VARCHAR(100) NULL,
    `prescribing_provider` VARCHAR(255) NULL,
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `medications_patient_id_idx`(`patient_id`),
    INDEX `medications_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `patient_documents` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `document_type` VARCHAR(50) NOT NULL,
    `file_key` VARCHAR(500) NOT NULL,
    `file_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `file_size` INTEGER NULL,
    `uploaded_by` CHAR(36) NOT NULL,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `patient_documents_patient_id_idx`(`patient_id`),
    INDEX `patient_documents_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `patient_photos` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `encounter_id` CHAR(36) NULL,
    `photo_type` VARCHAR(50) NOT NULL,
    `file_key` VARCHAR(500) NOT NULL,
    `body_area` VARCHAR(100) NULL,
    `notes` TEXT NULL,
    `taken_by` CHAR(36) NOT NULL,
    `deleted_at` DATETIME NULL,
    `taken_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `patient_photos_patient_id_idx`(`patient_id`),
    INDEX `patient_photos_encounter_id_idx`(`encounter_id`),
    INDEX `patient_photos_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `communication_preferences` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `allow_email` BOOLEAN NOT NULL DEFAULT true,
    `allow_sms` BOOLEAN NOT NULL DEFAULT true,
    `allow_marketing` BOOLEAN NOT NULL DEFAULT false,
    `updated_at` DATETIME NOT NULL,

    UNIQUE INDEX `communication_preferences_patient_id_key`(`patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `patient_intakes` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `token` VARCHAR(255) NOT NULL,
    `form_data` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `completed_at` DATETIME NULL,
    `expires_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `patient_intakes_token_key`(`token`),
    INDEX `patient_intakes_token_idx`(`token`),
    INDEX `patient_intakes_patient_id_idx`(`patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `phi_deletion_requests` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `requested_by` CHAR(36) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `reason` TEXT NULL,
    `retention_passed` BOOLEAN NOT NULL DEFAULT false,
    `processed_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `phi_deletion_requests_patient_id_idx`(`patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_categories` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `display_order` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `services` (
    `id` CHAR(36) NOT NULL,
    `category_id` CHAR(36) NULL,
    `name` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) NULL,
    `description` TEXT NULL,
    `duration_minutes` INTEGER NOT NULL,
    `price_cents` INTEGER NULL,
    `price_note` VARCHAR(255) NULL,
    `promo_group` VARCHAR(100) NULL,
    `requires_consultation` BOOLEAN NOT NULL DEFAULT false,
    `requires_consent` BOOLEAN NOT NULL DEFAULT true,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `services_slug_key`(`slug`),
    INDEX `services_slug_idx`(`slug`),
    INDEX `services_is_active_idx`(`is_active`),
    INDEX `services_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_locations` (
    `id` CHAR(36) NOT NULL,
    `service_id` CHAR(36) NOT NULL,
    `location_id` CHAR(36) NOT NULL,

    UNIQUE INDEX `service_locations_service_id_location_id_key`(`service_id`, `location_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `provider_services` (
    `id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `service_id` CHAR(36) NOT NULL,

    UNIQUE INDEX `provider_services_staff_id_service_id_key`(`staff_id`, `service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `appointments` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `location_id` CHAR(36) NOT NULL,
    `start_at` DATETIME NOT NULL,
    `end_at` DATETIME NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED') NOT NULL DEFAULT 'PENDING',
    `booking_token` VARCHAR(255) NULL,
    `notes` TEXT NULL,
    `internal_notes` TEXT NULL,
    `source` ENUM('ONLINE', 'PHONE', 'WALK_IN', 'STAFF') NOT NULL DEFAULT 'ONLINE',
    `cancellation_reason` TEXT NULL,
    `cancelled_at` DATETIME NULL,
    `checked_in_at` DATETIME NULL,
    `started_at` DATETIME NULL,
    `completed_at` DATETIME NULL,
    `rescheduled_from_id` CHAR(36) NULL,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME NOT NULL,

    UNIQUE INDEX `appointments_booking_token_key`(`booking_token`),
    INDEX `appointments_start_at_idx`(`start_at`),
    INDEX `appointments_staff_id_start_at_idx`(`staff_id`, `start_at`),
    INDEX `appointments_patient_id_idx`(`patient_id`),
    INDEX `appointments_status_idx`(`status`),
    INDEX `appointments_location_id_start_at_idx`(`location_id`, `start_at`),
    INDEX `appointments_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `appointment_status_histories` (
    `id` CHAR(36) NOT NULL,
    `appointment_id` CHAR(36) NOT NULL,
    `previous_status` ENUM('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED') NULL,
    `new_status` ENUM('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED') NOT NULL,
    `changed_by` CHAR(36) NOT NULL,
    `reason` TEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `appointment_status_histories_appointment_id_idx`(`appointment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `appointment_services` (
    `id` CHAR(36) NOT NULL,
    `appointment_id` CHAR(36) NOT NULL,
    `service_id` CHAR(36) NOT NULL,
    `price_cents` INTEGER NULL,
    `duration_minutes` INTEGER NULL,

    UNIQUE INDEX `appointment_services_appointment_id_service_id_key`(`appointment_id`, `service_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_availabilities` (
    `id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `location_id` CHAR(36) NOT NULL,
    `day_of_week` INTEGER NOT NULL,
    `start_time` VARCHAR(10) NOT NULL,
    `end_time` VARCHAR(10) NOT NULL,
    `is_recurring` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_time_offs` (
    `id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `reason` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `approved_by` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `waitlist_entries` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `service_id` CHAR(36) NULL,
    `location_id` CHAR(36) NULL,
    `preferred_days` VARCHAR(100) NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'waiting',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `encounters` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `appointment_id` CHAR(36) NULL,
    `provider_id` CHAR(36) NOT NULL,
    `location_id` CHAR(36) NULL,
    `encounter_date` DATE NOT NULL,
    `encounter_type` VARCHAR(50) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    `chief_complaint` TEXT NULL,
    `completed_at` DATETIME NULL,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME NOT NULL,

    INDEX `encounters_patient_id_idx`(`patient_id`),
    INDEX `encounters_provider_id_idx`(`provider_id`),
    INDEX `encounters_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `soap_notes` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `appointment_id` CHAR(36) NULL,
    `encounter_id` CHAR(36) NULL,
    `author_id` CHAR(36) NOT NULL,
    `note_type` VARCHAR(50) NOT NULL DEFAULT 'soap',
    `subjective` TEXT NULL,
    `objective` TEXT NULL,
    `assessment` TEXT NULL,
    `plan` TEXT NULL,
    `additional_data` JSON NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `cosigned_by` CHAR(36) NULL,
    `cosigned_at` DATETIME NULL,
    `signed_at` DATETIME NULL,
    `locked_at` DATETIME NULL,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME NOT NULL,

    INDEX `soap_notes_patient_id_idx`(`patient_id`),
    INDEX `soap_notes_status_idx`(`status`),
    INDEX `soap_notes_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `soap_note_versions` (
    `id` CHAR(36) NOT NULL,
    `note_id` CHAR(36) NOT NULL,
    `version_number` INTEGER NOT NULL,
    `subjective` TEXT NULL,
    `objective` TEXT NULL,
    `assessment` TEXT NULL,
    `plan` TEXT NULL,
    `additional_data` JSON NULL,
    `created_by` CHAR(36) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `note_signatures` (
    `id` CHAR(36) NOT NULL,
    `note_id` CHAR(36) NOT NULL,
    `signer_id` CHAR(36) NOT NULL,
    `signature_type` VARCHAR(50) NOT NULL,
    `signature_data` TEXT NULL,
    `ip_address` VARCHAR(45) NULL,
    `signed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cosign_queues` (
    `id` CHAR(36) NOT NULL,
    `note_id` CHAR(36) NOT NULL,
    `author_id` CHAR(36) NOT NULL,
    `required_cosigner_role` VARCHAR(50) NOT NULL DEFAULT 'medical_director',
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `assigned_to_id` CHAR(36) NULL,
    `requested_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME NULL,

    UNIQUE INDEX `cosign_queues_note_id_key`(`note_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `note_addendums` (
    `id` CHAR(36) NOT NULL,
    `note_id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `requested_by` VARCHAR(50) NOT NULL DEFAULT 'patient',
    `reason` TEXT NOT NULL,
    `addendum_text` TEXT NOT NULL,
    `author_id` CHAR(36) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `gfe_forms` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `provider_id` CHAR(36) NOT NULL,
    `services` JSON NOT NULL,
    `total_estimate_cents` INTEGER NOT NULL,
    `patient_signature` TEXT NULL,
    `signed_at` DATETIME NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
    `valid_until` DATE NULL,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME NOT NULL,

    INDEX `gfe_forms_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `treatment_plans` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `provider_id` CHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `planned_services` JSON NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME NOT NULL,

    INDEX `treatment_plans_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `protocols` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `protocol_type` VARCHAR(50) NOT NULL,
    `steps` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME NULL,
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME NOT NULL,

    INDEX `protocols_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `protocol_runs` (
    `id` CHAR(36) NOT NULL,
    `protocol_id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `encounter_id` CHAR(36) NULL,
    `run_by` CHAR(36) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    `step_data` JSON NULL,
    `started_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `adverse_events` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `encounter_id` CHAR(36) NULL,
    `reported_by` CHAR(36) NOT NULL,
    `event_type` VARCHAR(100) NOT NULL,
    `severity` VARCHAR(20) NOT NULL,
    `description` TEXT NOT NULL,
    `actions_taken` TEXT NULL,
    `outcome` TEXT NULL,
    `reported_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scribe_sessions` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `encounter_id` CHAR(36) NULL,
    `provider_id` CHAR(36) NOT NULL,
    `audio_file_key` VARCHAR(500) NULL,
    `transcript` TEXT NULL,
    `generated_soap` JSON NULL,
    `audio_purged_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audio_lifecycle_logs` (
    `id` CHAR(36) NOT NULL,
    `session_id` CHAR(36) NOT NULL,
    `file_key` VARCHAR(500) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `executed_by` VARCHAR(100) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transcript_storages` (
    `id` CHAR(36) NOT NULL,
    `session_id` CHAR(36) NOT NULL,
    `full_transcript` TEXT NOT NULL,
    `confidence_score` DECIMAL(5, 2) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_processing_audits` (
    `id` CHAR(36) NOT NULL,
    `provider` VARCHAR(100) NOT NULL DEFAULT 'lovable_ai_gateway',
    `model_name` VARCHAR(100) NOT NULL,
    `input_token_count` INTEGER NOT NULL DEFAULT 0,
    `output_token_count` INTEGER NOT NULL DEFAULT 0,
    `processing_duration_ms` INTEGER NOT NULL DEFAULT 0,
    `purpose` VARCHAR(100) NOT NULL,
    `phi_redacted` BOOLEAN NOT NULL DEFAULT true,
    `prompt_hash` VARCHAR(255) NULL,
    `response_hash` VARCHAR(255) NULL,
    `user_id` CHAR(36) NULL,
    `patient_id` CHAR(36) NULL,
    `encounter_id` CHAR(36) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_processing_audits_purpose_created_at_idx`(`purpose`, `created_at` DESC),
    INDEX `ai_processing_audits_patient_id_idx`(`patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purge_logs` (
    `id` CHAR(36) NOT NULL,
    `resource_type` VARCHAR(50) NOT NULL,
    `resource_id` CHAR(36) NOT NULL,
    `purged_file_key` VARCHAR(500) NOT NULL,
    `purge_reason` VARCHAR(255) NOT NULL,
    `purged_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consent_templates` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `service_id` CHAR(36) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `consent_templates_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consent_versions` (
    `id` CHAR(36) NOT NULL,
    `template_id` CHAR(36) NOT NULL,
    `version_number` INTEGER NOT NULL,
    `content` TEXT NOT NULL,
    `effective_date` DATE NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consent_assignments` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `template_id` CHAR(36) NOT NULL,
    `appointment_id` CHAR(36) NULL,
    `assigned_by` CHAR(36) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consent_signatures` (
    `id` CHAR(36) NOT NULL,
    `assignment_id` CHAR(36) NOT NULL,
    `template_id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NULL,
    `client_email` VARCHAR(255) NOT NULL,
    `token` VARCHAR(255) NULL,
    `signature_data` TEXT NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` TEXT NULL,
    `signed_at` DATETIME NULL,
    `expires_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `consent_signatures_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consent_audit_histories` (
    `id` CHAR(36) NOT NULL,
    `signature_id` CHAR(36) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `performed_by` VARCHAR(255) NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `sku` VARCHAR(100) NULL,
    `description` TEXT NULL,
    `category` VARCHAR(100) NULL,
    `unit` VARCHAR(50) NOT NULL DEFAULT 'units',
    `min_reorder_level` INTEGER NOT NULL DEFAULT 10,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `products_sku_key`(`sku`),
    INDEX `products_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vendors` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `contact_name` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `phone` VARCHAR(20) NULL,
    `address` TEXT NULL,
    `website` VARCHAR(500) NULL,
    `has_baa` BOOLEAN NOT NULL DEFAULT false,
    `baa_signed_at` DATE NULL,
    `notes` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `vendors_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vendor_baas` (
    `id` CHAR(36) NOT NULL,
    `vendor_id` CHAR(36) NOT NULL,
    `baa_document_key` VARCHAR(500) NOT NULL,
    `effective_date` DATE NOT NULL,
    `expiry_date` DATE NULL,
    `is_verified` BOOLEAN NOT NULL DEFAULT false,
    `verified_by` CHAR(36) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_lots` (
    `id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NULL,
    `product_name` VARCHAR(255) NOT NULL,
    `lot_number` VARCHAR(100) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unit` VARCHAR(50) NOT NULL DEFAULT 'units',
    `vendor_id` CHAR(36) NULL,
    `location_id` CHAR(36) NOT NULL,
    `cost_per_unit_cents` INTEGER NULL,
    `expiry_date` DATE NULL,
    `received_at` DATE NOT NULL,
    `received_by` CHAR(36) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lot_expiry_trackings` (
    `id` CHAR(36) NOT NULL,
    `lot_id` CHAR(36) NOT NULL,
    `alert_date` DATE NOT NULL,
    `is_alert_sent` BOOLEAN NOT NULL DEFAULT false,
    `alert_sent_at` DATETIME NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_movements` (
    `id` CHAR(36) NOT NULL,
    `lot_id` CHAR(36) NOT NULL,
    `movement_type` VARCHAR(20) NOT NULL,
    `quantity_change` INTEGER NOT NULL,
    `reason` TEXT NULL,
    `patient_id` CHAR(36) NULL,
    `encounter_id` CHAR(36) NULL,
    `performed_by` CHAR(36) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `treatment_usages` (
    `id` CHAR(36) NOT NULL,
    `encounter_id` CHAR(36) NOT NULL,
    `lot_id` CHAR(36) NOT NULL,
    `units_used` INTEGER NOT NULL,
    `body_site` VARCHAR(100) NULL,
    `performed_by` CHAR(36) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `appointment_id` CHAR(36) NULL,
    `subtotal_cents` INTEGER NOT NULL,
    `discount_cents` INTEGER NOT NULL DEFAULT 0,
    `tax_cents` INTEGER NOT NULL DEFAULT 0,
    `total_cents` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'unpaid',
    `due_date` DATE NULL,
    `deleted_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME NOT NULL,

    INDEX `invoices_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invoice_items` (
    `id` CHAR(36) NOT NULL,
    `invoice_id` CHAR(36) NOT NULL,
    `service_id` CHAR(36) NULL,
    `product_id` CHAR(36) NULL,
    `description` VARCHAR(255) NOT NULL,
    `unit_price_cents` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `total_cents` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` CHAR(36) NOT NULL,
    `invoice_id` CHAR(36) NULL,
    `patient_id` CHAR(36) NOT NULL,
    `appointment_id` CHAR(36) NULL,
    `amount_cents` INTEGER NOT NULL,
    `tip_cents` INTEGER NOT NULL DEFAULT 0,
    `discount_cents` INTEGER NOT NULL DEFAULT 0,
    `payment_method` VARCHAR(50) NOT NULL,
    `stripe_payment_id` VARCHAR(255) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'completed',
    `refund_amount_cents` INTEGER NOT NULL DEFAULT 0,
    `processed_by` CHAR(36) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refunds` (
    `id` CHAR(36) NOT NULL,
    `payment_id` CHAR(36) NOT NULL,
    `amount_cents` INTEGER NOT NULL,
    `reason` TEXT NOT NULL,
    `stripe_refund_id` VARCHAR(255) NULL,
    `processed_by` CHAR(36) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vouchers` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(50) NOT NULL,
    `discount_type` VARCHAR(20) NOT NULL,
    `discount_value` INTEGER NOT NULL,
    `max_uses` INTEGER NOT NULL DEFAULT 1,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATE NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `vouchers_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `packages` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `services` JSON NOT NULL,
    `price_cents` INTEGER NOT NULL,
    `validity_days` INTEGER NOT NULL DEFAULT 365,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `patient_credits` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `amount_cents` INTEGER NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `expires_at` DATE NULL,
    `used_at` DATETIME NULL,
    `used_payment_id` CHAR(36) NULL,
    `created_by` CHAR(36) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_methods` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `stripe_payment_method_id` VARCHAR(255) NOT NULL,
    `card_brand` VARCHAR(20) NULL,
    `card_last4` VARCHAR(4) NULL,
    `card_exp_month` INTEGER NULL,
    `card_exp_year` INTEGER NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `no_show_charges` (
    `id` CHAR(36) NOT NULL,
    `appointment_id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `amount_cents` INTEGER NOT NULL,
    `payment_method_id` CHAR(36) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `charged_by` CHAR(36) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `no_show_charges_appointment_id_key`(`appointment_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `resource_type` VARCHAR(50) NOT NULL,
    `resource_id` CHAR(36) NULL,
    `patient_id` CHAR(36) NULL,
    `ip_address` VARCHAR(45) NOT NULL,
    `user_agent` TEXT NULL,
    `old_value` JSON NULL,
    `new_value` JSON NULL,
    `metadata` JSON NULL,
    `phi_redacted` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_user_id_created_at_idx`(`user_id`, `created_at` DESC),
    INDEX `audit_logs_patient_id_created_at_idx`(`patient_id`, `created_at` DESC),
    INDEX `audit_logs_action_created_at_idx`(`action`, `created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `phi_access_logs` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `resource_type` VARCHAR(50) NOT NULL,
    `resource_id` CHAR(36) NULL,
    `ip_address` VARCHAR(45) NOT NULL,
    `user_agent` TEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `phi_access_logs_patient_id_created_at_idx`(`patient_id`, `created_at` DESC),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `phi_export_audits` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NULL,
    `export_type` VARCHAR(50) NOT NULL,
    `record_count` INTEGER NOT NULL DEFAULT 1,
    `ip_address` VARCHAR(45) NOT NULL,
    `user_agent` TEXT NULL,
    `file_key` VARCHAR(500) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `phi_export_audits_user_id_created_at_idx`(`user_id`, `created_at` DESC),
    INDEX `phi_export_audits_patient_id_idx`(`patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `breach_reports` (
    `id` CHAR(36) NOT NULL,
    `reported_by` CHAR(36) NOT NULL,
    `breach_type` VARCHAR(100) NOT NULL,
    `description` TEXT NOT NULL,
    `patients_affected` INTEGER NOT NULL DEFAULT 0,
    `phi_involved` BOOLEAN NOT NULL DEFAULT false,
    `discovery_date` DATE NOT NULL,
    `cmia_deadline` DATE NOT NULL,
    `hhs_notification_date` DATE NULL,
    `ca_ag_notification_date` DATE NULL,
    `remediation_steps` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'reported',
    `resolved_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `policy_versions` (
    `id` CHAR(36) NOT NULL,
    `policy_id` CHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NOT NULL,
    `version_number` INTEGER NOT NULL,
    `effective_date` DATE NOT NULL,
    `review_date` DATE NULL,
    `is_current` BOOLEAN NOT NULL DEFAULT true,
    `deleted_at` DATETIME NULL,
    `created_by` CHAR(36) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `policy_versions_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_training_records` (
    `id` CHAR(36) NOT NULL,
    `staff_id` CHAR(36) NOT NULL,
    `policy_version_id` CHAR(36) NOT NULL,
    `training_name` VARCHAR(255) NOT NULL,
    `score` INTEGER NULL,
    `acknowledged_at` DATETIME NOT NULL,
    `signature_data` TEXT NULL,
    `ip_address` VARCHAR(45) NULL,

    UNIQUE INDEX `staff_training_records_staff_id_policy_version_id_key`(`staff_id`, `policy_version_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `device_inventories` (
    `id` CHAR(36) NOT NULL,
    `device_name` VARCHAR(255) NOT NULL,
    `serial_number` VARCHAR(100) NULL,
    `device_type` VARCHAR(50) NOT NULL,
    `assigned_to_id` CHAR(36) NULL,
    `is_encrypted` BOOLEAN NOT NULL DEFAULT true,
    `screen_lock_enabled` BOOLEAN NOT NULL DEFAULT true,
    `disposal_date` DATE NULL,
    `disposal_log` TEXT NULL,

    UNIQUE INDEX `device_inventories_serial_number_key`(`serial_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `external_disclosures` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `disclosed_to` VARCHAR(255) NOT NULL,
    `purpose` TEXT NOT NULL,
    `description_of_phi` TEXT NOT NULL,
    `disclosed_by` CHAR(36) NOT NULL,
    `disclosed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `retention_until` DATETIME NOT NULL,

    INDEX `external_disclosures_patient_id_idx`(`patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_logs` (
    `id` CHAR(36) NOT NULL,
    `recipient_email` VARCHAR(255) NOT NULL,
    `patient_id` CHAR(36) NULL,
    `subject` VARCHAR(255) NOT NULL,
    `template_name` VARCHAR(100) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'sent',
    `provider_message_id` VARCHAR(255) NULL,
    `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sms_logs` (
    `id` CHAR(36) NOT NULL,
    `phone_number` VARCHAR(20) NOT NULL,
    `patient_id` CHAR(36) NULL,
    `message_body` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'sent',
    `provider_message_id` VARCHAR(255) NULL,
    `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_queues` (
    `id` CHAR(36) NOT NULL,
    `channel` VARCHAR(20) NOT NULL,
    `recipient` VARCHAR(255) NOT NULL,
    `subject` VARCHAR(255) NULL,
    `body` TEXT NOT NULL,
    `trigger_event` VARCHAR(100) NOT NULL,
    `contains_phi` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(20) NOT NULL DEFAULT 'queued',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `next_attempt_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_queues_status_idx`(`status`),
    INDEX `notification_queues_contains_phi_idx`(`contains_phi`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_logs` (
    `id` CHAR(36) NOT NULL,
    `event_id` VARCHAR(255) NOT NULL,
    `event_type` VARCHAR(100) NOT NULL,
    `source` VARCHAR(50) NOT NULL DEFAULT 'stripe',
    `payload` JSON NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'processed',
    `processed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `webhook_logs_event_id_key`(`event_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `postop_checkins` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `encounter_id` CHAR(36) NULL,
    `treatment_name` VARCHAR(255) NOT NULL,
    `day_number` INTEGER NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `pain_score` INTEGER NULL,
    `swelling_level` VARCHAR(20) NULL,
    `bruising_level` VARCHAR(20) NULL,
    `patient_notes` TEXT NULL,
    `flagged_reason` TEXT NULL,
    `completed_at` DATETIME NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prom_responses` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `treatment_name` VARCHAR(255) NOT NULL,
    `survey_type` VARCHAR(50) NOT NULL,
    `responses` JSON NOT NULL,
    `total_score` DECIMAL(5, 2) NULL,
    `completed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `terminal_settings` (
    `id` CHAR(36) NOT NULL,
    `location_id` CHAR(36) NOT NULL,
    `terminal_id` VARCHAR(100) NULL,
    `stripe_location_id` VARCHAR(100) NULL,
    `settings` JSON NULL,
    `updated_at` DATETIME NOT NULL,

    UNIQUE INDEX `terminal_settings_location_id_key`(`location_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sms_snippets` (
    `id` CHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `body` TEXT NOT NULL,
    `category` VARCHAR(50) NULL,
    `created_by` CHAR(36) NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `device_presets` (
    `id` CHAR(36) NOT NULL,
    `device_name` VARCHAR(255) NOT NULL,
    `preset_name` VARCHAR(255) NOT NULL,
    `settings` JSON NOT NULL,
    `location_id` CHAR(36) NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rewards` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `points` INTEGER NOT NULL DEFAULT 0,
    `tier` VARCHAR(50) NOT NULL DEFAULT 'bronze',
    `lifetime_points` INTEGER NOT NULL DEFAULT 0,
    `last_earned_at` DATETIME NULL,

    UNIQUE INDEX `rewards_patient_id_key`(`patient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mfa_configs` ADD CONSTRAINT `mfa_configs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mfa_recovery_codes` ADD CONSTRAINT `mfa_recovery_codes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_audit_logs` ADD CONSTRAINT `auth_audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_histories` ADD CONSTRAINT `password_histories_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `security_event_logs` ADD CONSTRAINT `security_event_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_profiles` ADD CONSTRAINT `staff_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_locations` ADD CONSTRAINT `staff_locations_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `staff_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_locations` ADD CONSTRAINT `staff_locations_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_profiles` ADD CONSTRAINT `patient_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demographics` ADD CONSTRAINT `demographics_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medical_histories` ADD CONSTRAINT `medical_histories_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `allergies` ADD CONSTRAINT `allergies_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `medications` ADD CONSTRAINT `medications_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_documents` ADD CONSTRAINT `patient_documents_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_documents` ADD CONSTRAINT `patient_documents_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_photos` ADD CONSTRAINT `patient_photos_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_photos` ADD CONSTRAINT `patient_photos_encounter_id_fkey` FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_photos` ADD CONSTRAINT `patient_photos_taken_by_fkey` FOREIGN KEY (`taken_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `communication_preferences` ADD CONSTRAINT `communication_preferences_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_intakes` ADD CONSTRAINT `patient_intakes_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `phi_deletion_requests` ADD CONSTRAINT `phi_deletion_requests_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `phi_deletion_requests` ADD CONSTRAINT `phi_deletion_requests_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `services` ADD CONSTRAINT `services_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `service_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_locations` ADD CONSTRAINT `service_locations_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_locations` ADD CONSTRAINT `service_locations_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `provider_services` ADD CONSTRAINT `provider_services_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `staff_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `provider_services` ADD CONSTRAINT `provider_services_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_rescheduled_from_id_fkey` FOREIGN KEY (`rescheduled_from_id`) REFERENCES `appointments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointment_status_histories` ADD CONSTRAINT `appointment_status_histories_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointment_services` ADD CONSTRAINT `appointment_services_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointment_services` ADD CONSTRAINT `appointment_services_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_availabilities` ADD CONSTRAINT `staff_availabilities_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `waitlist_entries` ADD CONSTRAINT `waitlist_entries_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `encounters` ADD CONSTRAINT `encounters_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `encounters` ADD CONSTRAINT `encounters_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `encounters` ADD CONSTRAINT `encounters_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `encounters` ADD CONSTRAINT `encounters_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `soap_notes` ADD CONSTRAINT `soap_notes_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `soap_notes` ADD CONSTRAINT `soap_notes_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `soap_notes` ADD CONSTRAINT `soap_notes_encounter_id_fkey` FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `soap_notes` ADD CONSTRAINT `soap_notes_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `soap_notes` ADD CONSTRAINT `soap_notes_cosigned_by_fkey` FOREIGN KEY (`cosigned_by`) REFERENCES `staff_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `soap_note_versions` ADD CONSTRAINT `soap_note_versions_note_id_fkey` FOREIGN KEY (`note_id`) REFERENCES `soap_notes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `note_signatures` ADD CONSTRAINT `note_signatures_note_id_fkey` FOREIGN KEY (`note_id`) REFERENCES `soap_notes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cosign_queues` ADD CONSTRAINT `cosign_queues_note_id_fkey` FOREIGN KEY (`note_id`) REFERENCES `soap_notes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cosign_queues` ADD CONSTRAINT `cosign_queues_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cosign_queues` ADD CONSTRAINT `cosign_queues_assigned_to_id_fkey` FOREIGN KEY (`assigned_to_id`) REFERENCES `staff_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `note_addendums` ADD CONSTRAINT `note_addendums_note_id_fkey` FOREIGN KEY (`note_id`) REFERENCES `soap_notes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `note_addendums` ADD CONSTRAINT `note_addendums_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `note_addendums` ADD CONSTRAINT `note_addendums_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gfe_forms` ADD CONSTRAINT `gfe_forms_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gfe_forms` ADD CONSTRAINT `gfe_forms_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treatment_plans` ADD CONSTRAINT `treatment_plans_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treatment_plans` ADD CONSTRAINT `treatment_plans_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `protocol_runs` ADD CONSTRAINT `protocol_runs_protocol_id_fkey` FOREIGN KEY (`protocol_id`) REFERENCES `protocols`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `protocol_runs` ADD CONSTRAINT `protocol_runs_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `protocol_runs` ADD CONSTRAINT `protocol_runs_encounter_id_fkey` FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `protocol_runs` ADD CONSTRAINT `protocol_runs_run_by_fkey` FOREIGN KEY (`run_by`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `adverse_events` ADD CONSTRAINT `adverse_events_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `adverse_events` ADD CONSTRAINT `adverse_events_encounter_id_fkey` FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `adverse_events` ADD CONSTRAINT `adverse_events_reported_by_fkey` FOREIGN KEY (`reported_by`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scribe_sessions` ADD CONSTRAINT `scribe_sessions_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scribe_sessions` ADD CONSTRAINT `scribe_sessions_encounter_id_fkey` FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scribe_sessions` ADD CONSTRAINT `scribe_sessions_provider_id_fkey` FOREIGN KEY (`provider_id`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audio_lifecycle_logs` ADD CONSTRAINT `audio_lifecycle_logs_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `scribe_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transcript_storages` ADD CONSTRAINT `transcript_storages_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `scribe_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_processing_audits` ADD CONSTRAINT `ai_processing_audits_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_processing_audits` ADD CONSTRAINT `ai_processing_audits_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_processing_audits` ADD CONSTRAINT `ai_processing_audits_encounter_id_fkey` FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_templates` ADD CONSTRAINT `consent_templates_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_versions` ADD CONSTRAINT `consent_versions_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `consent_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_assignments` ADD CONSTRAINT `consent_assignments_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_assignments` ADD CONSTRAINT `consent_assignments_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `consent_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_assignments` ADD CONSTRAINT `consent_assignments_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_signatures` ADD CONSTRAINT `consent_signatures_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `consent_assignments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_signatures` ADD CONSTRAINT `consent_signatures_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_audit_histories` ADD CONSTRAINT `consent_audit_histories_signature_id_fkey` FOREIGN KEY (`signature_id`) REFERENCES `consent_signatures`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vendor_baas` ADD CONSTRAINT `vendor_baas_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_lots` ADD CONSTRAINT `inventory_lots_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_lots` ADD CONSTRAINT `inventory_lots_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_lots` ADD CONSTRAINT `inventory_lots_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_lots` ADD CONSTRAINT `inventory_lots_received_by_fkey` FOREIGN KEY (`received_by`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lot_expiry_trackings` ADD CONSTRAINT `lot_expiry_trackings_lot_id_fkey` FOREIGN KEY (`lot_id`) REFERENCES `inventory_lots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_lot_id_fkey` FOREIGN KEY (`lot_id`) REFERENCES `inventory_lots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_performed_by_fkey` FOREIGN KEY (`performed_by`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treatment_usages` ADD CONSTRAINT `treatment_usages_encounter_id_fkey` FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treatment_usages` ADD CONSTRAINT `treatment_usages_lot_id_fkey` FOREIGN KEY (`lot_id`) REFERENCES `inventory_lots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `treatment_usages` ADD CONSTRAINT `treatment_usages_performed_by_fkey` FOREIGN KEY (`performed_by`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_service_id_fkey` FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_items` ADD CONSTRAINT `invoice_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_invoice_id_fkey` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_processed_by_fkey` FOREIGN KEY (`processed_by`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_credits` ADD CONSTRAINT `patient_credits_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_credits` ADD CONSTRAINT `patient_credits_used_payment_id_fkey` FOREIGN KEY (`used_payment_id`) REFERENCES `payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `patient_credits` ADD CONSTRAINT `patient_credits_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_methods` ADD CONSTRAINT `payment_methods_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `no_show_charges` ADD CONSTRAINT `no_show_charges_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `no_show_charges` ADD CONSTRAINT `no_show_charges_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `no_show_charges` ADD CONSTRAINT `no_show_charges_payment_method_id_fkey` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `no_show_charges` ADD CONSTRAINT `no_show_charges_charged_by_fkey` FOREIGN KEY (`charged_by`) REFERENCES `staff_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `phi_access_logs` ADD CONSTRAINT `phi_access_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `phi_export_audits` ADD CONSTRAINT `phi_export_audits_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `phi_export_audits` ADD CONSTRAINT `phi_export_audits_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `breach_reports` ADD CONSTRAINT `breach_reports_reported_by_fkey` FOREIGN KEY (`reported_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_versions` ADD CONSTRAINT `policy_versions_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_training_records` ADD CONSTRAINT `staff_training_records_staff_id_fkey` FOREIGN KEY (`staff_id`) REFERENCES `staff_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_training_records` ADD CONSTRAINT `staff_training_records_policy_version_id_fkey` FOREIGN KEY (`policy_version_id`) REFERENCES `policy_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_inventories` ADD CONSTRAINT `device_inventories_assigned_to_id_fkey` FOREIGN KEY (`assigned_to_id`) REFERENCES `staff_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `external_disclosures` ADD CONSTRAINT `external_disclosures_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `external_disclosures` ADD CONSTRAINT `external_disclosures_disclosed_by_fkey` FOREIGN KEY (`disclosed_by`) REFERENCES `staff_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `postop_checkins` ADD CONSTRAINT `postop_checkins_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `postop_checkins` ADD CONSTRAINT `postop_checkins_encounter_id_fkey` FOREIGN KEY (`encounter_id`) REFERENCES `encounters`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prom_responses` ADD CONSTRAINT `prom_responses_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `terminal_settings` ADD CONSTRAINT `terminal_settings_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `device_presets` ADD CONSTRAINT `device_presets_location_id_fkey` FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rewards` ADD CONSTRAINT `rewards_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
