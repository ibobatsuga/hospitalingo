CREATE TABLE `certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`approved_by` text,
	`requested_at` text NOT NULL,
	`issued_at` text,
	`expires_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `certificates_learner_id_unique` ON `certificates` (`learner_id`);--> statement-breakpoint
CREATE INDEX `certificates_status_idx` ON `certificates` (`status`,`requested_at`);--> statement-breakpoint
CREATE TABLE `lesson_completions` (
	`learner_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`domain` text NOT NULL,
	`best_score` integer NOT NULL,
	`completed_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`learner_id`, `lesson_id`)
);
--> statement-breakpoint
CREATE TABLE `step_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`domain` text NOT NULL,
	`step` text NOT NULL,
	`transcript` text NOT NULL,
	`score` integer NOT NULL,
	`critical_error` integer DEFAULT false NOT NULL,
	`feedback_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `step_attempts_learner_idx` ON `step_attempts` (`learner_id`,`created_at`);