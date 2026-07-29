import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const learnerProgress = sqliteTable("learner_progress", {
  learnerId: text("learner_id").primaryKey(),
  hotelCompleted: integer("hotel_completed").notNull().default(0),
  restaurantCompleted: integer("restaurant_completed").notNull().default(0),
  currentLesson: integer("current_lesson").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const lessonAttempts = sqliteTable("lesson_attempts", {
  id: text("id").primaryKey(),
  learnerId: text("learner_id").notNull(),
  lessonId: text("lesson_id").notNull(),
  domain: text("domain", { enum: ["hotel", "restaurant"] }).notNull(),
  score: integer("score").notNull(),
  criticalError: integer("critical_error", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});
