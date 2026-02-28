ALTER TABLE `clientProfiles` ADD COLUMN `instagramBusinessId` varchar(255);--> statement-breakpoint
ALTER TABLE `clientProfiles` ADD COLUMN `instagramAccessToken` text;--> statement-breakpoint
ALTER TABLE `clientProfiles` ADD COLUMN `instagramUsername` varchar(255);--> statement-breakpoint
CREATE TABLE `marketing_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientSlug` varchar(128) NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('discovery','strategy','generating','approval','active','completed') NOT NULL DEFAULT 'discovery',
	`strategy` text,
	`brandVoice` text,
	`targetAudience` text,
	`contentThemes` text,
	`postsPerWeek` int DEFAULT 3,
	`startDate` date,
	`endDate` date,
	`createdAt` timestamp NOT NULL DEFAULT NOW(),
	`updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
	CONSTRAINT `marketing_campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketing_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`scheduledAt` timestamp,
	`caption` text,
	`hashtags` text,
	`imagePrompt` text,
	`imageUrl` text,
	`status` enum('draft','approved','rejected','scheduled','posted','failed') NOT NULL DEFAULT 'draft',
	`instagramPostId` varchar(128),
	`theme` varchar(255),
	`notes` text,
	`sortOrder` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT NOW(),
	CONSTRAINT `marketing_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaign_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`role` varchar(32) NOT NULL,
	`content` text NOT NULL,
	`toolCallId` varchar(128),
	`toolName` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT NOW(),
	CONSTRAINT `campaign_messages_id` PRIMARY KEY(`id`)
);
