CREATE TABLE `learner_progress` (
	`learner_id` text PRIMARY KEY NOT NULL,
	`hotel_completed` integer DEFAULT 0 NOT NULL,
	`restaurant_completed` integer DEFAULT 0 NOT NULL,
	`current_lesson` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lesson_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`learner_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`domain` text NOT NULL,
	`score` integer NOT NULL,
	`critical_error` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
