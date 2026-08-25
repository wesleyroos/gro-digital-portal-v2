ALTER TABLE `invoices` ADD COLUMN `sentAt` timestamp NULL DEFAULT NULL;
--> statement-breakpoint
UPDATE `invoices` SET `sentAt` = COALESCE(`updatedAt`, `createdAt`) WHERE `status` <> 'draft' AND `sentAt` IS NULL;
