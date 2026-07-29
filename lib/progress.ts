import type { Domain } from "./content";

export type CertificateStatus = "locked" | "pending" | "approved" | "expired";

export type LearnerProgress = {
  learnerId: string;
  hotelCompleted: number;
  restaurantCompleted: number;
  currentLesson: number;
  certificateEligible: boolean;
  certificateStatus: CertificateStatus;
  certificateId?: string;
  certificateIssuedAt?: string;
  certificateExpiresAt?: string;
  updatedAt: string;
};

export type AttemptInput = {
  lessonId: string;
  domain: Domain;
  step: "speaking" | "role_practice";
  transcript: string;
  score: number;
  criticalError: boolean;
  feedback?: unknown;
};

type ProgressRow = {
  learner_id: string;
  hotel_completed: number;
  restaurant_completed: number;
  current_lesson: number;
  updated_at: string;
};

type CertificateRow = {
  id: string;
  learner_id: string;
  status: CertificateStatus;
  approved_by: string | null;
  requested_at: string;
  issued_at: string | null;
  expires_at: string | null;
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
    db.prepare(`CREATE TABLE IF NOT EXISTS step_attempts (
      id TEXT PRIMARY KEY,
      learner_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      step TEXT NOT NULL,
      transcript TEXT NOT NULL,
      score INTEGER NOT NULL,
      critical_error INTEGER NOT NULL DEFAULT 0,
      feedback_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS lesson_completions (
      learner_id TEXT NOT NULL,
      lesson_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      best_score INTEGER NOT NULL,
      completed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (learner_id, lesson_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      learner_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      approved_by TEXT,
      requested_at TEXT NOT NULL,
      issued_at TEXT,
      expires_at TEXT,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_daily_usage (
      learner_id TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      assessments INTEGER NOT NULL DEFAULT 0,
      transcriptions INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (learner_id, usage_date)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS lesson_attempts_learner_idx ON lesson_attempts (learner_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS step_attempts_learner_idx ON step_attempts (learner_id, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS certificates_status_idx ON certificates (status, requested_at)"),
  ]);
  schemaReady = true;
}

export async function consumeDailyAiQuota(db: D1Database, learnerId: string, kind: "assessment" | "transcription") {
  await ensureProgressSchema(db);
  const date = new Date().toISOString().slice(0, 10);
  const row = await db.prepare("SELECT assessments, transcriptions FROM ai_daily_usage WHERE learner_id = ? AND usage_date = ?")
    .bind(learnerId, date).first<{ assessments: number; transcriptions: number }>();
  const limit = kind === "assessment" ? 30 : 5;
  const used = kind === "assessment" ? row?.assessments ?? 0 : row?.transcriptions ?? 0;
  if (used >= limit) return { allowed: false, used, limit };
  const assessmentIncrement = kind === "assessment" ? 1 : 0;
  const transcriptionIncrement = kind === "transcription" ? 1 : 0;
  await db.prepare(`INSERT INTO ai_daily_usage (learner_id, usage_date, assessments, transcriptions) VALUES (?, ?, ?, ?)
    ON CONFLICT(learner_id, usage_date) DO UPDATE SET assessments = assessments + ?, transcriptions = transcriptions + ?`)
    .bind(learnerId, date, assessmentIncrement, transcriptionIncrement, assessmentIncrement, transcriptionIncrement).run();
  return { allowed: true, used: used + 1, limit };
}

async function certificateFor(db: D1Database, learnerId: string, eligible: boolean) {
  if (!eligible) return null;
  const now = new Date().toISOString();
  let certificate = await db.prepare("SELECT * FROM certificates WHERE learner_id = ?").bind(learnerId).first<CertificateRow>();
  if (!certificate) {
    await db
      .prepare("INSERT INTO certificates (id, learner_id, status, requested_at, updated_at) VALUES (?, ?, 'pending', ?, ?)")
      .bind(`HL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, learnerId, now, now)
      .run();
    certificate = await db.prepare("SELECT * FROM certificates WHERE learner_id = ?").bind(learnerId).first<CertificateRow>();
  }
  if (certificate?.status === "approved" && certificate.expires_at && certificate.expires_at < now) {
    await db.prepare("UPDATE certificates SET status = 'expired', updated_at = ? WHERE id = ?").bind(now, certificate.id).run();
    certificate = { ...certificate, status: "expired", updated_at: now };
  }
  return certificate;
}

async function mapProgress(db: D1Database, row: ProgressRow): Promise<LearnerProgress> {
  const eligible = row.hotel_completed >= 25 && row.restaurant_completed >= 25;
  const certificate = await certificateFor(db, row.learner_id, eligible);
  return {
    learnerId: row.learner_id,
    hotelCompleted: row.hotel_completed,
    restaurantCompleted: row.restaurant_completed,
    currentLesson: row.current_lesson,
    certificateEligible: eligible,
    certificateStatus: certificate?.status ?? "locked",
    certificateId: certificate?.id,
    certificateIssuedAt: certificate?.issued_at ?? undefined,
    certificateExpiresAt: certificate?.expires_at ?? undefined,
    updatedAt: row.updated_at,
  };
}

export async function getLearnerProgress(db: D1Database, learnerId: string): Promise<LearnerProgress> {
  await ensureProgressSchema(db);
  let existing = await db
    .prepare("SELECT learner_id, hotel_completed, restaurant_completed, current_lesson, updated_at FROM learner_progress WHERE learner_id = ?")
    .bind(learnerId)
    .first<ProgressRow>();
  if (!existing) {
    const now = new Date().toISOString();
    const isDemo = learnerId.endsWith("@hospitalingo.local");
    const hotelCompleted = isDemo ? 6 : 0;
    const restaurantCompleted = isDemo ? 5 : 0;
    const currentLesson = hotelCompleted + restaurantCompleted + 1;
    await db.prepare("INSERT INTO learner_progress (learner_id, hotel_completed, restaurant_completed, current_lesson, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind(learnerId, hotelCompleted, restaurantCompleted, currentLesson, now).run();
    existing = { learner_id: learnerId, hotel_completed: hotelCompleted, restaurant_completed: restaurantCompleted, current_lesson: currentLesson, updated_at: now };
  }
  return mapProgress(db, existing);
}

export async function recordStepAttempt(db: D1Database, learnerId: string, input: AttemptInput) {
  await ensureProgressSchema(db);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO step_attempts
    (id, learner_id, lesson_id, domain, step, transcript, score, critical_error, feedback_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, learnerId, input.lessonId, input.domain, input.step, input.transcript, input.score, input.criticalError ? 1 : 0, JSON.stringify(input.feedback ?? {}), now)
    .run();
  return { id, createdAt: now };
}

export async function completeLearnerLesson(db: D1Database, learnerId: string, input: AttemptInput): Promise<LearnerProgress> {
  const current = await getLearnerProgress(db, learnerId);
  const now = new Date().toISOString();
  const verifiedAttempt = await db.prepare(`SELECT score, critical_error, transcript, feedback_json FROM step_attempts
    WHERE learner_id = ? AND lesson_id = ? AND step = 'role_practice' ORDER BY created_at DESC LIMIT 1`)
    .bind(learnerId, input.lessonId).first<{ score: number; critical_error: number; transcript: string; feedback_json: string }>();
  if (!verifiedAttempt || verifiedAttempt.score < 75 || verifiedAttempt.critical_error) throw new Error("QUALIFYING_ATTEMPT_REQUIRED");
  input = { ...input, score: verifiedAttempt.score, criticalError: false, transcript: verifiedAttempt.transcript, feedback: JSON.parse(verifiedAttempt.feedback_json || "{}") };
  const prior = await db.prepare("SELECT best_score FROM lesson_completions WHERE learner_id = ? AND lesson_id = ?")
    .bind(learnerId, input.lessonId).first<{ best_score: number }>();
  const statements = [
    db.prepare("INSERT INTO lesson_attempts (id, learner_id, lesson_id, domain, score, critical_error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), learnerId, input.lessonId, input.domain, input.score, input.criticalError ? 1 : 0, now),
  ];

  let hotelCompleted = current.hotelCompleted;
  let restaurantCompleted = current.restaurantCompleted;
  if (!prior) {
    hotelCompleted = Math.min(25, hotelCompleted + (input.domain === "hotel" ? 1 : 0));
    restaurantCompleted = Math.min(25, restaurantCompleted + (input.domain === "restaurant" ? 1 : 0));
    statements.push(db.prepare("INSERT INTO lesson_completions (learner_id, lesson_id, domain, best_score, completed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(learnerId, input.lessonId, input.domain, input.score, now, now));
  } else if (input.score > prior.best_score) {
    statements.push(db.prepare("UPDATE lesson_completions SET best_score = ?, updated_at = ? WHERE learner_id = ? AND lesson_id = ?")
      .bind(input.score, now, learnerId, input.lessonId));
  }
  const currentLesson = Math.min(50, hotelCompleted + restaurantCompleted + 1);
  statements.push(db.prepare("UPDATE learner_progress SET hotel_completed = ?, restaurant_completed = ?, current_lesson = ?, updated_at = ? WHERE learner_id = ?")
    .bind(hotelCompleted, restaurantCompleted, currentLesson, now, learnerId));
  await db.batch(statements);
  return mapProgress(db, { learner_id: learnerId, hotel_completed: hotelCompleted, restaurant_completed: restaurantCompleted, current_lesson: currentLesson, updated_at: now });
}

export async function getLearnerHistory(db: D1Database, learnerId: string, limit = 30) {
  await ensureProgressSchema(db);
  const attempts = await db.prepare(`SELECT id, lesson_id, domain, step, transcript, score, critical_error, feedback_json, created_at
    FROM step_attempts WHERE learner_id = ? ORDER BY created_at DESC LIMIT ?`).bind(learnerId, Math.min(100, Math.max(1, limit))).all();
  const completions = await db.prepare(`SELECT lesson_id, domain, best_score, completed_at, updated_at
    FROM lesson_completions WHERE learner_id = ? ORDER BY completed_at DESC`).bind(learnerId).all();
  return { attempts: attempts.results, completions: completions.results };
}

export async function listCertificateRequests(db: D1Database) {
  await ensureProgressSchema(db);
  const rows = await db.prepare(`SELECT c.id, c.learner_id, c.status, c.requested_at, c.issued_at, c.expires_at,
      u.display_name, u.email, p.hotel_completed, p.restaurant_completed
    FROM certificates c
    JOIN users u ON u.id = c.learner_id
    LEFT JOIN learner_progress p ON p.learner_id = c.learner_id
    ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, c.requested_at DESC`).all();
  return rows.results;
}

export async function approveCertificate(db: D1Database, certificateId: string, approverId: string) {
  await ensureProgressSchema(db);
  const now = new Date();
  const expires = new Date(now);
  expires.setUTCDate(expires.getUTCDate() + 365);
  const result = await db.prepare(`UPDATE certificates SET status = 'approved', approved_by = ?, issued_at = ?, expires_at = ?, updated_at = ?
    WHERE id = ? AND status IN ('pending', 'expired')`).bind(approverId, now.toISOString(), expires.toISOString(), now.toISOString(), certificateId).run();
  if (!result.meta.changes) throw new Error("CERTIFICATE_NOT_PENDING");
  return db.prepare("SELECT * FROM certificates WHERE id = ?").bind(certificateId).first();
}
