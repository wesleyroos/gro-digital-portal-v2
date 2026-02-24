ALTER TABLE `users`
  ADD COLUMN `googleRefreshToken` text,
  ADD COLUMN `googleConnectedEmail` varchar(320);
