CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rate_limits_expires_at` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`download_token` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transfers_code_hash` ON `transfers` (`code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_transfers_download_token` ON `transfers` (`download_token`);--> statement-breakpoint
CREATE INDEX `idx_transfers_expires_at` ON `transfers` (`expires_at`);