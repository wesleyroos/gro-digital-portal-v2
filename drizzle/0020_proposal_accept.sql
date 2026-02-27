ALTER TABLE `proposals` ADD COLUMN `acceptedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `proposals` ADD COLUMN `acceptedBy` varchar(320) NULL;
