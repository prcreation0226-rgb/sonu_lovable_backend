-- Create Index for Foreign Key before dropping unique index
CREATE INDEX `staff_training_records_staff_id_idx` ON `staff_training_records`(`staff_id`);

-- Drop Unique Index
ALTER TABLE `staff_training_records` DROP INDEX `staff_training_records_staff_id_policy_version_id_key`;
