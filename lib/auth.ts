import { Buffer } from "node:buffer";

export type UserRole = "admin" | "learner";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  mustChangePassword: boolean;
};

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  status: string;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  must_change_password: number;
};

const SESSION_COOKIE = "hospitalingo_session";
const PASSWORD_ITERATIONS = 120_000;
const SESSION_DAYS = 7;

let authSchemaReady = false;

export async function ensureAuthSchema(db: D1Database) {
  if (authSchemaReady) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      password_iterations INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'learner',
      status TEXT NOT NULL DEFAULT 'active',
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS app_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS login_attempts (
      attempt_key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL,
      window_started_at TEXT NOT NULL,
      locked_until TEXT
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions (user_id, expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS app_users_role_idx ON app_users (role, status)"),
  ]);
  authSchemaReady = true;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function randomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Buffer.from(bytes).toString("base64url");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("base64url");
}

async function passwordDigest(password: string, salt: string, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: Buffer.from(salt, "base64url"), iterations },
    key,
    256,
  );
  return Buffer.from(bits).toString("base64url");
}

async function buildPasswordRecord(password: string) {
  const salt = randomToken(16);
  return {
    salt,
    iterations: PASSWORD_ITERATIONS,
    hash: await passwordDigest(password, salt, PASSWORD_ITERATIONS),
  };
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function mapUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    mustChangePassword: Boolean(row.must_change_password),
  };
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function sessionCookie(token: string, requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${SESSION_DAYS * 86400}`;
}

export function clearSessionCookie(requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

export async function userCount(db: D1Database) {
  await ensureAuthSchema(db);
  const row = await db.prepare("SELECT COUNT(*) AS total FROM app_users").first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export async function createInitialAdmin(
  db: D1Database,
  input: { email: string; displayName: string; password: string; suppliedSetupToken: string; expectedSetupToken?: string },
) {
  await ensureAuthSchema(db);
  if (!input.expectedSetupToken) throw new Error("SETUP_UNAVAILABLE");
  const suppliedHash = await sha256(input.suppliedSetupToken);
  const expectedHash = await sha256(input.expectedSetupToken);
  if (!safeEqual(suppliedHash, expectedHash)) throw new Error("INVALID_SETUP_TOKEN");
  if ((await userCount(db)) > 0) throw new Error("SETUP_COMPLETE");
  const password = await buildPasswordRecord(input.password);
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const result = await db
    .prepare(`INSERT INTO app_users (
      id, email, display_name, password_hash, password_salt, password_iterations,
      role, status, must_change_password, created_at, updated_at
    ) SELECT ?, ?, ?, ?, ?, ?, 'admin', 'active', 1, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM app_users)`)
    .bind(
      userId,
      normalizeEmail(input.email),
      input.displayName.trim(),
      password.hash,
      password.salt,
      password.iterations,
      now,
      now,
    )
    .run();
  if (!result.meta.changes) throw new Error("SETUP_COMPLETE");
  return createSession(db, userId);
}

async function createSession(db: D1Database, userId: string) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86400 * 1000).toISOString();
  await db
    .prepare("INSERT INTO app_sessions (token_hash, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)")
    .bind(tokenHash, userId, expiresAt, now.toISOString(), now.toISOString())
    .run();
  return token;
}

async function attemptKey(email: string, ip: string) {
  return sha256(`${normalizeEmail(email)}|${ip}`);
}

async function isLoginLocked(db: D1Database, key: string) {
  const row = await db
    .prepare("SELECT locked_until FROM login_attempts WHERE attempt_key = ?")
    .bind(key)
    .first<{ locked_until: string | null }>();
  return Boolean(row?.locked_until && Date.parse(row.locked_until) > Date.now());
}

async function recordLoginFailure(db: D1Database, key: string) {
  const now = new Date();
  const row = await db
    .prepare("SELECT attempts, window_started_at FROM login_attempts WHERE attempt_key = ?")
    .bind(key)
    .first<{ attempts: number; window_started_at: string }>();
  const insideWindow = row && now.getTime() - Date.parse(row.window_started_at) < 15 * 60 * 1000;
  const attempts = insideWindow ? row.attempts + 1 : 1;
  const windowStartedAt = insideWindow ? row.window_started_at : now.toISOString();
  const lockedUntil = attempts >= 5 ? new Date(now.getTime() + 15 * 60 * 1000).toISOString() : null;
  await db
    .prepare(`INSERT INTO login_attempts (attempt_key, attempts, window_started_at, locked_until)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(attempt_key) DO UPDATE SET attempts = excluded.attempts,
      window_started_at = excluded.window_started_at, locked_until = excluded.locked_until`)
    .bind(key, attempts, windowStartedAt, lockedUntil)
    .run();
}

export async function login(
  db: D1Database,
  input: { email: string; password: string; ip: string },
) {
  await ensureAuthSchema(db);
  const key = await attemptKey(input.email, input.ip);
  if (await isLoginLocked(db, key)) throw new Error("LOGIN_LOCKED");
  const row = await db
    .prepare(`SELECT id, email, display_name, role, status, password_hash, password_salt,
      password_iterations, must_change_password FROM app_users WHERE email = ?`)
    .bind(normalizeEmail(input.email))
    .first<UserRow>();
  if (!row || row.status !== "active") {
    await recordLoginFailure(db, key);
    throw new Error("INVALID_LOGIN");
  }
  const candidate = await passwordDigest(input.password, row.password_salt, row.password_iterations);
  if (!safeEqual(candidate, row.password_hash)) {
    await recordLoginFailure(db, key);
    throw new Error("INVALID_LOGIN");
  }
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM login_attempts WHERE attempt_key = ?").bind(key),
    db.prepare("UPDATE app_users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(now, now, row.id),
  ]);
  return { token: await createSession(db, row.id), user: mapUser(row) };
}

export async function getAuthenticatedUser(request: Request, db: D1Database) {
  await ensureAuthSchema(db);
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await db
    .prepare(`SELECT u.id, u.email, u.display_name, u.role, u.status, u.password_hash,
      u.password_salt, u.password_iterations, u.must_change_password
      FROM app_sessions s JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`)
    .bind(tokenHash, new Date().toISOString())
    .first<UserRow>();
  if (!row || row.status !== "active") return null;
  return mapUser(row);
}

export async function logout(request: Request, db: D1Database) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await db.prepare("DELETE FROM app_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function changePassword(
  db: D1Database,
  user: AuthUser,
  currentPassword: string,
  newPassword: string,
) {
  const row = await db
    .prepare(`SELECT id, email, display_name, role, status, password_hash, password_salt,
      password_iterations, must_change_password FROM app_users WHERE id = ?`)
    .bind(user.id)
    .first<UserRow>();
  if (!row) throw new Error("INVALID_LOGIN");
  const candidate = await passwordDigest(currentPassword, row.password_salt, row.password_iterations);
  if (!safeEqual(candidate, row.password_hash)) throw new Error("INVALID_LOGIN");
  const password = await buildPasswordRecord(newPassword);
  await db
    .prepare(`UPDATE app_users SET password_hash = ?, password_salt = ?, password_iterations = ?,
      must_change_password = 0, updated_at = ? WHERE id = ?`)
    .bind(password.hash, password.salt, password.iterations, new Date().toISOString(), user.id)
    .run();
}

export async function createLearners(
  db: D1Database,
  users: Array<{ email: string; displayName: string; temporaryPassword: string }>,
) {
  await ensureAuthSchema(db);
  const currentCount = await userCount(db);
  if (currentCount + users.length > 500) throw new Error("ACCOUNT_LIMIT");
  const created: string[] = [];
  const errors: Array<{ email: string; error: string }> = [];
  for (let start = 0; start < users.length; start += 10) {
    const chunk = users.slice(start, start + 10);
    const prepared = await Promise.all(chunk.map(async (user) => ({
      user,
      password: await buildPasswordRecord(user.temporaryPassword),
    })));
    for (const item of prepared) {
      const now = new Date().toISOString();
      try {
        await db
          .prepare(`INSERT INTO app_users (
            id, email, display_name, password_hash, password_salt, password_iterations,
            role, status, must_change_password, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'learner', 'active', 1, ?, ?)`)
          .bind(
            crypto.randomUUID(),
            normalizeEmail(item.user.email),
            item.user.displayName.trim(),
            item.password.hash,
            item.password.salt,
            item.password.iterations,
            now,
            now,
          )
          .run();
        created.push(normalizeEmail(item.user.email));
      } catch (error) {
        errors.push({
          email: normalizeEmail(item.user.email),
          error: String(error).includes("UNIQUE") ? "Account already exists" : "Account could not be created",
        });
      }
    }
  }
  return { created, errors };
}

export async function listUsersWithProgress(db: D1Database) {
  await ensureAuthSchema(db);
  const result = await db
    .prepare(`SELECT u.id, u.email, u.display_name, u.role, u.status, u.must_change_password,
      u.created_at, u.last_login_at,
      COALESCE(p.hotel_completed, 0) AS hotel_completed,
      COALESCE(p.restaurant_completed, 0) AS restaurant_completed
      FROM app_users u LEFT JOIN learner_progress p ON p.learner_id = u.id
      ORDER BY CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END, u.display_name ASC LIMIT 500`)
    .all();
  return result.results;
}
