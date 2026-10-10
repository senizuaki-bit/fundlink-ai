CREATE TABLE IF NOT EXISTS `flywheel_evaluations` (
 `id` text PRIMARY KEY NOT NULL,
 `owner` text NOT NULL,
 `role` text NOT NULL,
 `created_at` text NOT NULL,
 `data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `flywheel_evaluations_scope` ON `flywheel_evaluations` (`owner`,`role`,`created_at`);
