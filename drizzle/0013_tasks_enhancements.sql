ALTER TABLE `tasks`
  ADD COLUMN `status` varchar(32) NOT NULL DEFAULT 'todo',
  ADD COLUMN `dueDate` date NULL,
  ADD COLUMN `priority` varchar(16) NULL,
  ADD COLUMN `notes` text NULL;

UPDATE `tasks` SET `status` = 'done' WHERE `done` = true;

ALTER TABLE `tasks` DROP COLUMN `done`;
