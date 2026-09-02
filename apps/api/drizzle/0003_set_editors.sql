CREATE TABLE `set_editors` (
	`set_id` text NOT NULL,
	`user_id` text NOT NULL,
	`added_by` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY (`set_id`, `user_id`)
);
