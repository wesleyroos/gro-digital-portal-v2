CREATE TABLE `quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(21) NOT NULL,
	`title` varchar(255) NOT NULL,
	`clientName` varchar(255) NOT NULL,
	`clientEmail` varchar(320),
	`htmlContent` mediumtext NOT NULL,
	`status` enum('draft','sent','signed') NOT NULL DEFAULT 'draft',
	`signedBy` varchar(255),
	`signedAt` timestamp,
	`signerIp` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `quotes_token_unique` UNIQUE(`token`)
);
