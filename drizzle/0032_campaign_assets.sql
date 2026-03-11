CREATE TABLE `campaignAssets` (
  `id` int AUTO_INCREMENT NOT NULL,
  `campaignId` int NOT NULL,
  `url` text NOT NULL,
  `label` varchar(255),
  `aiDescription` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `campaignAssets_id` PRIMARY KEY(`id`)
);
