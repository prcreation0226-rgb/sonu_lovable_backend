-- AlterTable: Add NPP version tracking and IP evidence to patient_profiles
ALTER TABLE `patient_profiles` ADD COLUMN `npp_version` VARCHAR(20) NULL,
                               ADD COLUMN `npp_ip_address` VARCHAR(45) NULL;
