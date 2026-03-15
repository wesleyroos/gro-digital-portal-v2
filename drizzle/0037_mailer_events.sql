ALTER TABLE `campaignMailers` ADD COLUMN `sentCount` int NOT NULL DEFAULT 0;

CREATE TABLE `mailerEvents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `mailerId` int NOT NULL,
  `type` enum('open','click') NOT NULL,
  `url` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `mailerEvents_id` PRIMARY KEY(`id`)
);
