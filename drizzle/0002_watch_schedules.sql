CREATE TABLE `watch_schedules` (
 `owner` text NOT NULL,
 `role` text NOT NULL,
 `revision` integer DEFAULT 0 NOT NULL,
 `enabled` integer DEFAULT 0 NOT NULL,
 `interval_hours` integer DEFAULT 24 NOT NULL,
 `entity_ids` text DEFAULT '[]' NOT NULL,
 `next_run_at` text,
 `last_run_at` text,
 `last_status` text DEFAULT 'idle' NOT NULL,
 `last_message` text DEFAULT '' NOT NULL,
 `heartbeat_at` text,
 `cursor` text,
 `cycle_failures` integer DEFAULT 0 NOT NULL,
 `lease_id` text,
 `lease_until` text,
 PRIMARY KEY (`owner`,`role`)
);
