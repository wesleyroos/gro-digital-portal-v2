ALTER TABLE `clientProfiles` ADD COLUMN `analyticsEmbed` text NULL;
--> statement-breakpoint
ALTER TABLE `clientProfiles` ADD COLUMN `analyticsToken` varchar(21) NULL;
