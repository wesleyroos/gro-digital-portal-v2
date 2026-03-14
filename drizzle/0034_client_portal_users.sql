ALTER TABLE `users` MODIFY COLUMN `role` enum('client','admin','superAdmin') NOT NULL DEFAULT 'client';--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `clientSlug` varchar(128);--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `passwordHash` text;
