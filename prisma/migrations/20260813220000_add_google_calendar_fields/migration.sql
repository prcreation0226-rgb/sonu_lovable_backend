-- Add Google Calendar fields to staff_profiles and appointments tables

ALTER TABLE `staff_profiles` 
ADD COLUMN `google_refresh_token` TEXT NULL,
ADD COLUMN `google_calendar_id` VARCHAR(255) NULL,
ADD COLUMN `google_calendar_connected_at` DATETIME(3) NULL;

ALTER TABLE `appointments` 
ADD COLUMN `google_event_id` VARCHAR(255) NULL,
ADD COLUMN `google_synced_at` DATETIME(3) NULL;
