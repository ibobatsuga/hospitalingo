import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appUsers = sqliteTable("app_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  role: text("role", { enum: ["admin", "learner"] }).notNull().default("learner"),
  status: text("status", { enum: ["active", "disabled"] }).notNull().default("active"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  lastLoginAt: text("last_login_at"),
}, (table) => [index("app_users_role_idx").on(table.role, table.status)]);

export const appSessions = sqliteTable("app_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
}, (table) => [index("app_sessions_user_idx").on(table.userId, table.expiresAt)]);

export const loginAttempts = sqliteTable("login_attempts", {
  attemptKey: text("attempt_key").primaryKey(),
  attempts: integer("attempts").notNull(),
  windowStartedAt: text("window_started_at").notNull(),
  lockedUntil: text("locked_until"),
});

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
