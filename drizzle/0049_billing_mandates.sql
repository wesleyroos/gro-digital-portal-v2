CREATE TABLE `billingMandates` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `clientSlug` varchar(128) NOT NULL,
  `clientName` varchar(255) NOT NULL,
  `clientEmail` varchar(320) NOT NULL,
  `shareToken` varchar(32) NOT NULL UNIQUE,
  `status` enum('pending_card','active','paused','cancelled','failed') NOT NULL DEFAULT 'pending_card',
  `paystackAuthCode` varchar(128),
  `paystackCustomerCode` varchar(128),
  `cardLast4` varchar(4),
  `cardBrand` varchar(32),
  `cardExpMonth` varchar(2),
  `cardExpYear` varchar(4),
  `startDate` date NOT NULL,
  `activatedAt` timestamp,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `mandateLineItems` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `mandateId` int NOT NULL,
  `description` varchar(512) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `interval` enum('monthly','annual') NOT NULL,
  `status` enum('active','paused') NOT NULL DEFAULT 'active',
  `nextBillingDate` date NOT NULL,
  `lastBilledAt` timestamp,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE `invoices` ADD COLUMN `mandateId` int;
