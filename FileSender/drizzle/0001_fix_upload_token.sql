ALTER TABLE `transfers` ADD COLUMN `upload_token` text;
UPDATE `transfers` SET `upload_token` = lower(hex(randomblob(16))) WHERE `upload_token` IS NULL OR `upload_token` = '';
ALTER TABLE `transfers` RENAME TO `transfers_old`;
CREATE TABLE `transfers` (
  `id` text PRIMARY KEY NOT NULL,
  `code_hash` text NOT NULL,
  `download_token` text NOT NULL,
  `upload_token` text NOT NULL,
  `name` text NOT NULL,
  `size` integer NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL
);
INSERT INTO `transfers` (`id`, `code_hash`, `download_token`, `upload_token`, `name`, `size`, `status`, `created_at`, `expires_at`)
SELECT `id`, `code_hash`, `download_token`, `upload_token`, `name`, `size`, `status`, `created_at`, `expires_at`
FROM `transfers_old`;
DROP TABLE `transfers_old`;
CREATE UNIQUE INDEX `idx_transfers_upload_token` ON `transfers` (`upload_token`);
