import type { Domain } from "./content";

export type LearnerProgress = {
  learnerId: string;
  hotelCompleted: number;
  restaurantCompleted: number;
  currentLesson: number;
  certificateEligible: boolean;
  updatedAt: string;
};

type ProgressRow = {
  learner_id: string;
  hotel_completed: number;
  restaurant_completed: number;
  current_lesson: number;
  updated_at: string;
};

let schemaReady = false;

export async function ensureProgressSchema(db: D1Database) {
  if (schemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS learner_progress (
      learner_id TEXT PRIMARY KEY,
      hotel_completed INTEGER NOT NULL DEFAULT 0,
      restaurant_completed INTEGER NOT NULL DEFAULT 0,
      current_lesson INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS lesson_attempts (
      id TEXT PRIMARY KEY,
      learner_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      score INTEGER NOT NULL,
      critical_error INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS lesson_attempts_learner_idx ON lesson_attempts (learner_id, created_at)"),
  ]);
  schemaReady = true;
}

function mapProgress(row: ProgressRow): LearnerProgress {
  return {
    learnerId: row.learner_id,
    hotelCompleted: row.hotel_completed,
    restaurantCompleted: row.restaurant_completed,
    currentLesson: row.current_lesson,
    certificateEligible: row.hotel_completed >= 25 && row.restaurant_completed >= 25,
    updatedAt: row.updated_at,
  };
}

export async function getLearnerProgress(db: D1Database, learnerId: string): Promise<LearnerProgress> {
  await ensureProgressSchema(db);
  const existing = await db
    .prepare("SELECT learner_id, hotel_completed, restaurant_completed, current_lesson, updated_at FROM learner_progress WHERE learner_id = ?")
    .bind(learnerId)
    .first<ProgressRow>();

  if (existing) return mapProgress(existing);

  const now = new Date().toISOString();
  const isDemo = learnerId.endsWith("@hospitalingo.local");
  const hotelCompleted = isDemo ? 6 : 0;
  const restaurantCompleted = isDemo ? 5 : 0;
  const currentLesson = hotelCompleted + restaurantCompleted + 1;
  await db
    .prepare("INSERT INTO learner_progress (learner_id, hotel_completed, restaurant_completed, current_lesson, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(learnerId, hotelCompleted, restaurantCompleted, currentLesson, now)
    .run();

  return {
    learnerId,
    hotelCompleted,
    restaurantCompleted,
    currentLesson,
    certificateEligible: false,
    updatedAt: now,
  };
}

export async function completeLearnerLesson(
  db: D1Database,
  learnerId: string,
  lessonId: string,
  domain: Domain,
  score: number,
  criticalError: boolean,
): Promise<LearnerProgress> {
  const current = await getLearnerProgress(db, learnerId);
  const now = new Date().toISOString();
  const hotelCompleted = Math.min(25, current.hotelCompleted + (domain === "hotel" ? 1 : 0));
  const restaurantCompleted = Math.min(25, current.restaurantCompleted + (domain === "restaurant" ? 1 : 0));
  const currentLesson = Math.min(50, hotelCompleted + restaurantCompleted + 1);
  const attemptId = crypto.randomUUID();

  await db.batch([
    db
      .prepare("UPDATE learner_progress SET hotel_completed = ?, restaurant_completed = ?, current_lesson = ?, updated_at = ? WHERE learner_id = ?")
      .bind(hotelCompleted, restaurantCompleted, currentLesson, now, learnerId),
    db
      .prepare("INSERT INTO lesson_attempts (id, learner_id, lesson_id, domain, score, critical_error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(attemptId, learnerId, lessonId, domain, score, criticalError ? 1 : 0, now),
  ]);

  return {
    learnerId,
    hotelCompleted,
    restaurantCompleted,
    currentLesson,
    certificateEligible: hotelCompleted >= 25 && restaurantCompleted >= 25,
    updatedAt: now,
  };
}
