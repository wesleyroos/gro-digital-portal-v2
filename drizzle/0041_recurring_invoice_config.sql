CREATE TABLE `recurringInvoiceConfig` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `clientSlug` varchar(128) NOT NULL UNIQUE,
  `enabled` tinyint(1) NOT NULL DEFAULT 0,
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `description` varchar(512) NOT NULL DEFAULT 'Monthly Services',
  `recipientEmail` varchar(320) NULL,
  `sendDay` tinyint NOT NULL DEFAULT 25,
  `paymentTerms` varchar(255) NOT NULL DEFAULT 'Due upon receipt',
  `notes` text NULL,
  `lastSentAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `recurringInvoiceConfig_clientSlug_idx` (`clientSlug`)
);
