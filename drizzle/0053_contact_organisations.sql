CREATE TABLE IF NOT EXISTS `contactOrganisations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `contactId` int NOT NULL,
  `organisationId` int NOT NULL,
  `role` varchar(128) DEFAULT NULL,
  `isPrimary` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contactOrganisations_pair_unique` (`contactId`, `organisationId`),
  KEY `idx_contactOrganisations_contactId` (`contactId`),
  KEY `idx_contactOrganisations_organisationId` (`organisationId`)
);

ALTER TABLE `contacts` DROP COLUMN `organisationId`;
ALTER TABLE `contacts` DROP COLUMN `role`;
