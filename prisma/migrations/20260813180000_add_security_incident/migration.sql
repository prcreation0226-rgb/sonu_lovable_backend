-- CreateTable
CREATE TABLE `security_incidents` (
    `id` CHAR(36) NOT NULL,
    `incident_number` VARCHAR(50) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `incident_type` VARCHAR(100) NOT NULL,
    `severity` VARCHAR(20) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'open',
    `discovered_at` DATETIME(3) NOT NULL,
    `description` TEXT NOT NULL,
    `affected_systems` TEXT NULL,
    `reported_by` CHAR(36) NOT NULL,
    `assigned_user_id` CHAR(36) NULL,
    `containment_actions` TEXT NULL,
    `investigation_notes` TEXT NULL,
    `resolution` TEXT NULL,
    `is_phi_involved` BOOLEAN NOT NULL DEFAULT false,
    `breach_determined` BOOLEAN NOT NULL DEFAULT false,
    `assessment_rationale` TEXT NULL,
    `assessed_by` CHAR(36) NULL,
    `assessed_at` DATETIME(3) NULL,
    `breach_report_id` CHAR(36) NULL,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `security_incidents_incident_number_key`(`incident_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `security_incidents` ADD CONSTRAINT `security_incidents_reported_by_fkey` FOREIGN KEY (`reported_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `security_incidents` ADD CONSTRAINT `security_incidents_assigned_user_id_fkey` FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `security_incidents` ADD CONSTRAINT `security_incidents_assessed_by_fkey` FOREIGN KEY (`assessed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `security_incidents` ADD CONSTRAINT `security_incidents_breach_report_id_fkey` FOREIGN KEY (`breach_report_id`) REFERENCES `breach_reports`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
