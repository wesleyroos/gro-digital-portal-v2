CREATE TABLE `clientProfiles` (
	`clientSlug` varchar(128) NOT NULL,
	`notes` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientProfiles_clientSlug` PRIMARY KEY(`clientSlug`)
);
