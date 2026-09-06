ALTER TABLE `users` ADD `is_teacher` integer DEFAULT 0 NOT NULL;

ALTER TABLE `lesson_pages` ADD `type` text DEFAULT 'text' NOT NULL;
ALTER TABLE `lesson_pages` ADD `payload_json` text DEFAULT '{}' NOT NULL;

CREATE TABLE `lesson_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`type` text NOT NULL,
	`prompt` text NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);

CREATE INDEX `idx_lesson_exercises_lesson_id` ON `lesson_exercises` (`lesson_id`);
