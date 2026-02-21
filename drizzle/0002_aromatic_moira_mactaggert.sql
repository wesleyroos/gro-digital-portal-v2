ALTER TABLE `invoices` ADD `clientSlug` varchar(128) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `invoiceType` enum('once-off','monthly','annual') DEFAULT 'once-off' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `paymentUrl` varchar(512);