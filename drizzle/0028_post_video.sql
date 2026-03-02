ALTER TABLE `marketing_posts` ADD `mediaType` enum('image','video') NOT NULL DEFAULT 'image';
ALTER TABLE `marketing_posts` ADD `videoUrl` text;
