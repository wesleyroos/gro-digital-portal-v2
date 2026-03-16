ALTER TABLE `users` ADD COLUMN `lastSeenAt` timestamp NULL;

CREATE TABLE `userActivity` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `openId` varchar(64) NOT NULL,
  `action` varchar(64) NOT NULL,
  `path` varchar(255),
  `meta` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `userActivity_openId_idx` (`openId`),
  INDEX `userActivity_createdAt_idx` (`createdAt`)
);
