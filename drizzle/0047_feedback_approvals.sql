CREATE TABLE IF NOT EXISTS `feedbackApprovals` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `taskId` int,
  `type` varchar(16) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `currentUrl` varchar(1024),
  `userName` varchar(255),
  `userRole` varchar(64),
  `status` varchar(32) NOT NULL DEFAULT 'pending',
  `commitSha` varchar(64),
  `prNumber` int,
  `prUrl` varchar(512),
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decidedAt` timestamp NULL,
  `completedAt` timestamp NULL
);
