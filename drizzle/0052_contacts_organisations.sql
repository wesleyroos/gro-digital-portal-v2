CREATE TABLE IF NOT EXISTS `organisations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(128) NOT NULL,
  `name` varchar(255) NOT NULL,
  `stage` enum('prospect','lead','client','past_client') NOT NULL DEFAULT 'prospect',
  `website` varchar(512) DEFAULT NULL,
  `industry` varchar(255) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `organisations_slug_unique` (`slug`),
  KEY `idx_organisations_stage` (`stage`)
);

CREATE TABLE IF NOT EXISTS `contacts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `organisationId` int DEFAULT NULL,
  `firstName` varchar(128) DEFAULT NULL,
  `lastName` varchar(128) DEFAULT NULL,
  `email` varchar(320) DEFAULT NULL,
  `phone` varchar(32) DEFAULT NULL,
  `role` varchar(128) DEFAULT NULL,
  `isPrimary` boolean NOT NULL DEFAULT false,
  `isInternal` boolean NOT NULL DEFAULT false,
  `consentBasis` enum('none','existing_customer','explicit_optin') NOT NULL DEFAULT 'none',
  `consentSource` varchar(255) DEFAULT NULL,
  `consentAt` timestamp NULL DEFAULT NULL,
  `whatsappOptInAt` timestamp NULL DEFAULT NULL,
  `optedOutAt` timestamp NULL DEFAULT NULL,
  `doNotContact` boolean NOT NULL DEFAULT false,
  `source` varchar(64) DEFAULT NULL,
  `engageContactId` varchar(64) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contacts_email_unique` (`email`),
  UNIQUE KEY `contacts_phone_unique` (`phone`),
  KEY `idx_contacts_organisationId` (`organisationId`)
);

ALTER TABLE `leads` ADD COLUMN `organisationId` int DEFAULT NULL;
ALTER TABLE `leads` ADD KEY `idx_leads_organisationId` (`organisationId`);

ALTER TABLE `outreachProspects` ADD COLUMN `organisationId` int DEFAULT NULL;
ALTER TABLE `outreachProspects` ADD KEY `idx_outreachProspects_organisationId` (`organisationId`);
