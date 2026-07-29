CREATE TABLE `ai_daily_usage` (
	`learner_id` text NOT NULL,
	`usage_date` text NOT NULL,
	`assessments` integer DEFAULT 0 NOT NULL,
	`transcriptions` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`learner_id`, `usage_date`)
);
