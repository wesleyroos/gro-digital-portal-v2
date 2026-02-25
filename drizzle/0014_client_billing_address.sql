ALTER TABLE `invoices` ADD COLUMN `clientAddress` text NULL;
--> statement-breakpoint
ALTER TABLE `clientProfiles` ADD COLUMN `address` text NULL;
