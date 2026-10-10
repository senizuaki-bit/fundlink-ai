CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`object_key` text NOT NULL,
	`size` integer NOT NULL,
	`content_type` text NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`deal_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_documents_owner_role` ON `documents` (`owner`,`role`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`owner` text NOT NULL,
	`role` text NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`owner`, `role`)
);
