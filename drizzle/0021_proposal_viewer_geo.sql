ALTER TABLE `proposals` ADD COLUMN `viewerIp` varchar(45) NULL;
--> statement-breakpoint
ALTER TABLE `proposals` ADD COLUMN `viewerLocation` varchar(255) NULL;
