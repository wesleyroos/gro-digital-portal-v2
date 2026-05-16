CREATE TABLE `flyApps` (
  `appName` varchar(128) NOT NULL,
  `orgSlug` varchar(128) NOT NULL,
  `clientSlug` varchar(128) DEFAULT NULL,
  `label` varchar(256) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`appName`),
  KEY `idx_flyApps_clientSlug` (`clientSlug`),
  KEY `idx_flyApps_orgSlug` (`orgSlug`)
);
