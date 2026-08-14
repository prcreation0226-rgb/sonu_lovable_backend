-- AlterTable
ALTER TABLE `vendors` ADD COLUMN `category` VARCHAR(100) NULL,
                      ADD COLUMN `touches_phi` BOOLEAN NOT NULL DEFAULT false,
                      ADD COLUMN `baa_required` BOOLEAN NOT NULL DEFAULT true,
                      ADD COLUMN `baa_status` VARCHAR(30) NOT NULL DEFAULT 'pending',
                      ADD COLUMN `baa_renewal_at` DATE NULL,
                      ADD COLUMN `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
