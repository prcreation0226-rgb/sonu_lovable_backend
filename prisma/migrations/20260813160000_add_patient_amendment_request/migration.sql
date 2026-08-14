-- Additive migration for Patient Record Amendment Requests (HIPAA §164.526)
CREATE TABLE IF NOT EXISTS `patient_amendment_requests` (
    `id` CHAR(36) NOT NULL,
    `patient_id` CHAR(36) NOT NULL,
    `requested_by_user_id` CHAR(36) NOT NULL,
    `record_category` VARCHAR(100) NOT NULL,
    `note_id` CHAR(36) NULL,
    `current_text` TEXT NULL,
    `requested_correction` TEXT NOT NULL,
    `rationale` TEXT NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `staff_response` TEXT NULL,
    `denial_reason` TEXT NULL,
    `reviewed_by` CHAR(36) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    INDEX `patient_amendment_requests_patient_id_created_at_idx`(`patient_id`, `created_at` DESC),
    INDEX `patient_amendment_requests_status_idx`(`status`),
    CONSTRAINT `patient_amendment_requests_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patient_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `patient_amendment_requests_requested_by_user_id_fkey` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `patient_amendment_requests_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `staff_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `patient_amendment_requests_note_id_fkey` FOREIGN KEY (`note_id`) REFERENCES `soap_notes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
