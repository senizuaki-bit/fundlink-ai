CREATE TABLE `platform_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`actor_role` text NOT NULL,
	`stream` text NOT NULL,
	`event_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`company_key` text NOT NULL,
	`investor_key` text NOT NULL,
	`subject_key` text NOT NULL,
	`source_event_id` text NOT NULL,
	`source_type` text NOT NULL,
	`observed_at` text NOT NULL,
	`is_simulation` integer NOT NULL,
	`provenance` text NOT NULL,
	`learning_eligible` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `platform_events_scope` ON `platform_events` (`owner`,`actor_role`,`stream`,`observed_at`);--> statement-breakpoint
CREATE INDEX `platform_events_pair` ON `platform_events` (`company_key`,`investor_key`,`is_simulation`);--> statement-breakpoint
CREATE UNIQUE INDEX `platform_events_source` ON `platform_events` (`owner`,`actor_role`,`stream`,`source_type`,`source_event_id`);--> statement-breakpoint
CREATE TABLE `platform_projection_sync` (
	`owner` text NOT NULL,
	`actor_role` text NOT NULL,
	`stream` text NOT NULL,
	`version` integer NOT NULL,
	`sync_token` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `actor_role`, `stream`)
);
