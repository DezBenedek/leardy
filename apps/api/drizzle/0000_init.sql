CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`email` text,
	`created_at` text NOT NULL
);

CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);

CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);

CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`user_id`);

CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`join_code` text NOT NULL,
	`owner_id` text NOT NULL,
	`allow_student_sets` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);

CREATE UNIQUE INDEX `classes_join_code_unique` ON `classes` (`join_code`);

CREATE TABLE `class_members` (
	`class_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` text NOT NULL,
	PRIMARY KEY (`class_id`, `user_id`)
);

CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`class_id` text,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`visibility` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`client_id` text NOT NULL
);

CREATE INDEX `idx_sets_class_id` ON `sets` (`class_id`);
CREATE INDEX `idx_sets_owner_id` ON `sets` (`owner_id`);

CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`set_id` text NOT NULL,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`hint` text,
	`example` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`client_id` text NOT NULL
);

CREATE INDEX `idx_cards_set_id` ON `cards` (`set_id`);

CREATE TABLE `sync_cursors` (
	`user_id` text PRIMARY KEY NOT NULL,
	`cursor` text NOT NULL,
	`updated_at` text NOT NULL
);

CREATE TABLE `quiz_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`class_id` text NOT NULL,
	`set_id` text NOT NULL,
	`teacher_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);

CREATE TABLE `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`payload` text,
	`updated_at` text NOT NULL,
	`deleted_at` text
);

CREATE INDEX `idx_subjects_owner` ON `subjects` (`owner_id`);
CREATE UNIQUE INDEX `idx_subjects_owner_client` ON `subjects` (`owner_id`, `client_id`);

CREATE TABLE `decks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`subject_id` text,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`payload` text,
	`updated_at` text NOT NULL,
	`deleted_at` text
);

CREATE INDEX `idx_decks_owner` ON `decks` (`owner_id`);
CREATE UNIQUE INDEX `idx_decks_owner_client` ON `decks` (`owner_id`, `client_id`);

CREATE TABLE `cards_local` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`deck_id` text,
	`client_id` text NOT NULL,
	`front` text DEFAULT '' NOT NULL,
	`back` text DEFAULT '' NOT NULL,
	`hint` text,
	`example` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`payload` text,
	`updated_at` text NOT NULL,
	`deleted_at` text
);

CREATE INDEX `idx_cards_local_owner` ON `cards_local` (`owner_id`);
CREATE UNIQUE INDEX `idx_cards_local_owner_client` ON `cards_local` (`owner_id`, `client_id`);

CREATE TABLE `idempotency_keys` (
	`key` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL
);
