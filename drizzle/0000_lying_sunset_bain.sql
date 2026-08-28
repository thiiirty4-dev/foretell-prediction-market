CREATE TABLE `markets` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`closes_at` integer NOT NULL,
	`yes_price` integer DEFAULT 50 NOT NULL,
	`volume` integer DEFAULT 0 NOT NULL,
	`liquidity` integer DEFAULT 1000000 NOT NULL,
	`trader_count` integer DEFAULT 0 NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `markets_slug_unique` ON `markets` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_markets_status_volume` ON `markets` (`status`,`volume`);--> statement-breakpoint
CREATE INDEX `idx_markets_created_at` ON `markets` (`created_at`);--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`market_id` text NOT NULL,
	`side` text NOT NULL,
	`amount` integer NOT NULL,
	`shares` real NOT NULL,
	`price` integer NOT NULL,
	`trader_alias` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`market_id`) REFERENCES `markets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_trades_market_created` ON `trades` (`market_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_trades_created_at` ON `trades` (`created_at`);