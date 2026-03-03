ALTER TABLE `clientProfiles` ADD `facebookPageId` varchar(128);
ALTER TABLE `clientProfiles` ADD `facebookPageAccessToken` text;
ALTER TABLE `clientProfiles` ADD `facebookPageName` varchar(255);
ALTER TABLE `marketing_campaigns` ADD `postToInstagram` boolean NOT NULL DEFAULT true;
ALTER TABLE `marketing_campaigns` ADD `postToFacebook` boolean NOT NULL DEFAULT false;
ALTER TABLE `marketing_posts` ADD `facebookPostId` varchar(128);
