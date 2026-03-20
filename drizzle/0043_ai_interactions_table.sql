CREATE TABLE IF NOT EXISTS `aiInteractions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `source` varchar(64) NOT NULL DEFAULT 'mcp',
  `toolName` varchar(128) NOT NULL,
  `inputSummary` text,
  `isError` tinyint(1) NOT NULL DEFAULT 0,
  `clientSlug` varchar(128),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
