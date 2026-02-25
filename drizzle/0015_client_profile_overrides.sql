ALTER TABLE `clientProfiles`
  ADD COLUMN `name` varchar(255) NULL,
  ADD COLUMN `contact` varchar(255) NULL,
  ADD COLUMN `email` varchar(320) NULL,
  ADD COLUMN `phone` varchar(64) NULL;
