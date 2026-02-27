CREATE TABLE `proposalViews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `proposalId` int NOT NULL,
  `viewedAt` timestamp NOT NULL DEFAULT NOW(),
  `viewerIp` varchar(45),
  `viewerLocation` varchar(255),
  PRIMARY KEY (`id`)
);
