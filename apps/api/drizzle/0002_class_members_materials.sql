CREATE TABLE `class_bans` (
	`class_id` text NOT NULL,
	`user_id` text NOT NULL,
	`banned_by` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY (`class_id`, `user_id`)
);

CREATE TABLE `class_materials` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`note` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);

CREATE INDEX `idx_class_materials_class_id` ON `class_materials` (`class_id`);
