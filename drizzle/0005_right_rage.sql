CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`text` varchar(512) NOT NULL,
	`clientSlug` varchar(128),
	`clientName` varchar(255),
	`done` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
