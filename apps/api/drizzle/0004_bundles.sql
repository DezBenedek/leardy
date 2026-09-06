CREATE TABLE `bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`title` text NOT NULL,
	`owner_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);

CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`bundle_id` text NOT NULL,
	`title` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);

CREATE TABLE `lesson_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`body` text NOT NULL
);

CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`bundle_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`set_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);

CREATE TABLE `map_items` (
	`id` text PRIMARY KEY NOT NULL,
	`activity_id` text NOT NULL,
	`hotspots_json` text NOT NULL
);

CREATE TABLE `library_saves` (
	`bundle_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY (`bundle_id`, `user_id`)
);

CREATE TABLE `class_bundles` (
	`class_id` text NOT NULL,
	`bundle_id` text NOT NULL,
	`quiz_set_id` text,
	`assigned_at` text NOT NULL,
	PRIMARY KEY (`class_id`, `bundle_id`)
);

CREATE TABLE `lesson_progress` (
	`user_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`completed_at` text NOT NULL,
	PRIMARY KEY (`user_id`, `lesson_id`)
);

CREATE INDEX `idx_bundles_status` ON `bundles` (`status`);
CREATE INDEX `idx_lessons_bundle_id` ON `lessons` (`bundle_id`);
CREATE INDEX `idx_activities_bundle_id` ON `activities` (`bundle_id`);
CREATE INDEX `idx_class_bundles_class_id` ON `class_bundles` (`class_id`);
