ALTER TABLE `leads`
  ADD COLUMN `monthlyValue` decimal(12,2) AFTER `contactPhone`,
  ADD COLUMN `onceOffValue` decimal(12,2) AFTER `monthlyValue`;
