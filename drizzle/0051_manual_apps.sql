CREATE TABLE `manualApps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(128) NOT NULL,
  `provider` varchar(64) NOT NULL,
  `clientSlug` varchar(128) DEFAULT NULL,
  `label` varchar(256) DEFAULT NULL,
  `monthlyCostUsd` decimal(10,2) NOT NULL DEFAULT '0.00',
  `notes` text DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_manualApps_clientSlug` (`clientSlug`)
);
