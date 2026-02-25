CREATE TABLE `subscriptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `clientSlug` varchar(128) NOT NULL,
  `clientName` varchar(255) NOT NULL,
  `description` varchar(255),
  `amount` decimal(12,2) NOT NULL,
  `type` enum('monthly','annual') NOT NULL DEFAULT 'monthly',
  `status` enum('active','paused','cancelled') NOT NULL DEFAULT 'active',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
INSERT INTO `subscriptions` (`clientSlug`, `clientName`, `description`, `amount`, `type`, `status`)
SELECT i.clientSlug, i.clientName, i.projectName, i.totalAmount, i.invoiceType, 'active'
FROM invoices i
INNER JOIN (
  SELECT clientSlug, invoiceType, MAX(id) as maxId
  FROM invoices
  WHERE invoiceType IN ('monthly', 'annual')
  GROUP BY clientSlug, invoiceType
) latest ON i.id = latest.maxId;
