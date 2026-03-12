CREATE TABLE `campaignMailers` (
  `id` int AUTO_INCREMENT NOT NULL,
  `campaignId` int NOT NULL,
  `subject` varchar(255) NOT NULL DEFAULT '',
  `previewText` varchar(255),
  `htmlContent` text NOT NULL DEFAULT '',
  `status` enum('draft','scheduled','sent') NOT NULL DEFAULT 'draft',
  `scheduledAt` timestamp,
  `sentAt` timestamp,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `campaignMailers_id` PRIMARY KEY(`id`)
);
