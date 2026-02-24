CREATE TABLE `henry_messages` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `openId` varchar(64) NOT NULL,
  `role` enum('user','assistant') NOT NULL,
  `content` text NOT NULL,
  `createdAt` timestamp DEFAULT (now()) NOT NULL
);
