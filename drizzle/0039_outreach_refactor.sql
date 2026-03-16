-- Drop old outreach tables (order matters for FK integrity)
DROP TABLE IF EXISTS `outreachSends`;
DROP TABLE IF EXISTS `outreachSequenceSteps`;
DROP TABLE IF EXISTS `outreachSequences`;
DROP TABLE IF EXISTS `outreachProspects`;

-- Recreate outreachProspects with simplified schema
CREATE TABLE `outreachProspects` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `businessName` varchar(255) NOT NULL,
  `contactName` varchar(255),
  `contactEmail` varchar(320),
  `contactPhone` varchar(64),
  `website` varchar(512),
  `address` varchar(512),
  `industry` varchar(255),
  `pageSpeedScore` int,
  `issues` text,
  `status` enum('new','emailed','replied','converted') NOT NULL DEFAULT 'new',
  `lastEmailSubject` varchar(512),
  `lastEmailBody` text,
  `lastEmailSentAt` timestamp,
  `notes` text,
  `leadId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
