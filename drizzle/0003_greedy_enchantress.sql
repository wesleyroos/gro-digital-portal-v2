ALTER TABLE `invoices` ADD `shareToken` varchar(21);--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_shareToken_unique` UNIQUE(`shareToken`);