ALTER TABLE `quiz_sessions` ADD `pace` text DEFAULT 'teacher' NOT NULL;
ALTER TABLE `quiz_sessions` ADD `seconds` integer DEFAULT 30 NOT NULL;
ALTER TABLE `quiz_sessions` ADD `question_mode` text DEFAULT 'choice' NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`) WHERE `email` IS NOT NULL;
