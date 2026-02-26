CREATE TABLE `proposals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `token` varchar(21) NOT NULL,
  `title` varchar(255) NOT NULL,
  `htmlContent` text NOT NULL,
  `status` enum('draft','sent','viewed','accepted','declined') NOT NULL DEFAULT 'draft',
  `assignedType` enum('client','lead','none') NOT NULL DEFAULT 'none',
  `assignedName` varchar(255),
  `clientSlug` varchar(128),
  `leadId` int,
  `externalEmail` varchar(320),
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  `sentAt` timestamp NULL,
  `viewedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `proposals_token_unique` (`token`)
);
