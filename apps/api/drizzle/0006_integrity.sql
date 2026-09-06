CREATE INDEX IF NOT EXISTS `idx_class_members_user_id` ON `class_members` (`user_id`);
CREATE INDEX IF NOT EXISTS `idx_lesson_pages_lesson_id` ON `lesson_pages` (`lesson_id`);
CREATE INDEX IF NOT EXISTS `idx_map_items_activity_id` ON `map_items` (`activity_id`);
CREATE INDEX IF NOT EXISTS `idx_subjects_owner_updated` ON `subjects` (`owner_id`, `updated_at`);
CREATE INDEX IF NOT EXISTS `idx_decks_owner_updated` ON `decks` (`owner_id`, `updated_at`);
CREATE INDEX IF NOT EXISTS `idx_cards_local_owner_updated` ON `cards_local` (`owner_id`, `updated_at`);

CREATE TABLE IF NOT EXISTS `card_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`client_id` text NOT NULL,
	`card_id` text NOT NULL,
	`due_at` text NOT NULL,
	`payload` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS `idx_card_schedules_owner_updated` ON `card_schedules` (`owner_id`, `updated_at`);

CREATE TABLE IF NOT EXISTS `review_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`client_id` text NOT NULL,
	`card_id` text NOT NULL,
	`payload` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS `idx_review_logs_owner_updated` ON `review_logs` (`owner_id`, `updated_at`);

CREATE TABLE IF NOT EXISTS `daily_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`client_id` text NOT NULL,
	`date` text NOT NULL,
	`cards_reviewed` integer DEFAULT 0 NOT NULL,
	`payload` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS `idx_daily_activities_owner_updated` ON `daily_activities` (`owner_id`, `updated_at`);

DELETE FROM `library_saves` WHERE `bundle_id` NOT IN (SELECT `id` FROM `bundles`);
DELETE FROM `class_bundles` WHERE `bundle_id` NOT IN (SELECT `id` FROM `bundles`);
DELETE FROM `class_bundles` WHERE `class_id` NOT IN (SELECT `id` FROM `classes`);
DELETE FROM `lesson_progress` WHERE `lesson_id` NOT IN (SELECT `id` FROM `lessons`);
DELETE FROM `map_items` WHERE `activity_id` NOT IN (SELECT `id` FROM `activities`);
DELETE FROM `lesson_pages` WHERE `lesson_id` NOT IN (SELECT `id` FROM `lessons`);
DELETE FROM `lesson_exercises` WHERE `lesson_id` NOT IN (SELECT `id` FROM `lessons`);
