/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { z } from "zod";
import {
  assessWithCloudflare,
  cloudflareAiModels,
  hasCloudflareAi,
  transcribeWithCloudflare,
  type AiBinding,
} from "../lib/cloudflare-ai";
import {
  changePassword,
  clearSessionCookie,
  createInitialAdmin,
  createLearners,
  getAuthenticatedUser,
  listUsersWithProgress,
  login,
  logout,
  sessionCookie,
  userCount,
  type AuthUser,
} from "../lib/auth";
import { getTerms, glossaryDepartments, hospitalityTerms, lessons, searchTerms } from "../lib/content";
import {
  approveCertificate,
  completeLearnerLesson,
  consumeDailyAiQuota,
  ensureProgressSchema,
  getLearnerHistory,
  getLearnerProgress,
  listCertificateRequests,
  recordStepAttempt,
} from "../lib/progress";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  CONTENT?: R2Bucket;
  AI?: AiBinding;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_AI_TOKEN?: string;
  HOSPITALINGO_SETUP_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const completionSchema = z.object({
  lessonId: z.string().min(1).max(120),
  domain: z.enum(["hotel", "restaurant"]),
  score: z.number().int().min(0).max(100),
  criticalError: z.boolean().default(false),
  transcript: z.string().trim().min(2).max(3000),
  feedback: z.unknown().optional(),
});

const assessmentSchema = z.object({
  domain: z.enum(["hotel", "restaurant"]),
  transcript: z.string().trim().min(2).max(3000),
  task: z.enum(["speaking", "role_practice"]),
  lessonId: z.string().min(1).max(120).optional(),
  prompt: z.string().max(1000).optional(),
  safetyRule: z.string().max(1000).optional(),
});

const passwordSchema = z.string().min(10).max(128).refine(
  (value) => /[A-Za-z]/.test(value) && /\d/.test(value),
  "Password must contain a letter and a number.",
);

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

const setupSchema = z.object({
  email: z.string().email().max(254),
  displayName: z.string().trim().min(2).max(80),
  password: passwordSchema,
  setupToken: z.string().min(8).max(256),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

const learnerAccountSchema = z.object({
  email: z.string().email().max(254),
  displayName: z.string().trim().min(2).max(80),
  temporaryPassword: passwordSchema,
});

const createLearnersSchema = z.object({ users: z.array(learnerAccountSchema).min(1).max(100) });
const certificateActionSchema = z.object({ certificateId: z.string().min(4).max(80), action: z.literal("approve") });

function localDemoUser(request: Request): AuthUser | null {
  const hostname = new URL(request.url).hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") return null;
  return {
    id: "demo@hospitalingo.local",
    email: "demo@hospitalingo.local",
    displayName: "HospitaLingo Demo",
    role: "admin",
    mustChangePassword: false,
  };
}

async function currentUser(request: Request, env: Env) {
  if (env.DB) {
    const user = await getAuthenticatedUser(request, env.DB);
    if (user) return user;
  }
  return localDemoUser(request);
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function jsonWithCookie(payload: unknown, cookie: string, status = 200) {
  return Response.json(payload, { status, headers: { "set-cookie": cookie, "cache-control": "no-store" } });
}

async function handleAuthStatus(request: Request, env: Env) {
  const demo = localDemoUser(request);
  if (demo) return Response.json({ authenticated: true, user: demo, setupRequired: false });
  if (!env.DB) {
    return Response.json({ error: "Account database is unavailable." }, { status: 503 });
  }
  const user = await getAuthenticatedUser(request, env.DB);
  const setupRequired = (await userCount(env.DB)) === 0;
  return Response.json({
    authenticated: Boolean(user),
    user,
    setupRequired,
    setupAvailable: Boolean(env.HOSPITALINGO_SETUP_TOKEN),
  }, { headers: { "cache-control": "no-store" } });
}

async function handleSetup(request: Request, env: Env) {
  if (request.method !== "POST" || !sameOrigin(request)) return Response.json({ error: "Request rejected." }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Account database is unavailable." }, { status: 503 });
  const parsed = setupSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Check the email, name, password, and setup token." }, { status: 400 });
  try {
    const token = await createInitialAdmin(env.DB, {
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      password: parsed.data.password,
      suppliedSetupToken: parsed.data.setupToken,
      expectedSetupToken: env.HOSPITALINGO_SETUP_TOKEN,
    });
    return jsonWithCookie({ ok: true }, sessionCookie(token, request.url));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const message = code === "SETUP_UNAVAILABLE"
      ? "Set HOSPITALINGO_SETUP_TOKEN in Cloudflare first."
      : code === "SETUP_COMPLETE"
        ? "Initial setup has already been completed."
        : code === "INVALID_SETUP_TOKEN"
          ? "The setup token is incorrect."
          : "Administrator setup could not be completed. Please try again.";
    return Response.json({ error: message }, { status: code === "SETUP_COMPLETE" ? 409 : 403 });
  }
}

async function handleLogin(request: Request, env: Env) {
  if (request.method !== "POST" || !sameOrigin(request)) return Response.json({ error: "Request rejected." }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Account database is unavailable." }, { status: 503 });
  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Enter a valid email and password." }, { status: 400 });
  try {
    const result = await login(env.DB, {
      ...parsed.data,
      ip: request.headers.get("cf-connecting-ip") ?? "unknown",
    });
    return jsonWithCookie({ ok: true, user: result.user }, sessionCookie(result.token, request.url));
  } catch (error) {
    const locked = error instanceof Error && error.message === "LOGIN_LOCKED";
    return Response.json(
      { error: locked ? "Too many attempts. Try again in 15 minutes." : "Email or password is incorrect." },
      { status: locked ? 429 : 401 },
    );
  }
}

async function handleLogout(request: Request, env: Env) {
  if (request.method !== "POST" || !sameOrigin(request)) return Response.json({ error: "Request rejected." }, { status: 403 });
  if (env.DB) await logout(request, env.DB);
  return jsonWithCookie({ ok: true }, clearSessionCookie(request.url));
}

async function handleChangePassword(request: Request, env: Env) {
  if (request.method !== "POST" || !sameOrigin(request)) return Response.json({ error: "Request rejected." }, { status: 403 });
  if (!env.DB) return Response.json({ error: "Account database is unavailable." }, { status: 503 });
  const user = await currentUser(request, env);
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const parsed = changePasswordSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Use at least 10 characters with a letter and a number." }, { status: 400 });
  try {
    await changePassword(env.DB, user, parsed.data.currentPassword, parsed.data.newPassword);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "The current password is incorrect." }, { status: 401 });
  }
}

async function handleAdminUsers(request: Request, env: Env) {
  if (!env.DB) return Response.json({ error: "Account database is unavailable." }, { status: 503 });
  const user = await currentUser(request, env);
  if (!user || user.role !== "admin") return Response.json({ error: "Administrator access is required." }, { status: 403 });
  if (request.method === "GET") {
    await ensureProgressSchema(env.DB);
    return Response.json({ users: await listUsersWithProgress(env.DB), capacity: 500 });
  }
  if (request.method !== "POST" || !sameOrigin(request)) return Response.json({ error: "Request rejected." }, { status: 403 });
  const parsed = createLearnersSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Provide 1–100 valid accounts. Passwords need 10 characters, a letter, and a number." }, { status: 400 });
  return Response.json(await createLearners(env.DB, parsed.data.users));
}

async function handleProgressRequest(request: Request, env: Env) {
  if (!env.DB) return Response.json({ error: "Progress storage is unavailable." }, { status: 503 });
  const user = await currentUser(request, env);
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const learnerId = user.id;

  if (request.method === "GET") {
    return Response.json(await getLearnerProgress(env.DB, learnerId));
  }

  if (request.method === "POST") {
    const parsed = completionSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "The lesson result is invalid." }, { status: 400 });
    const lesson = lessons.find((entry) => entry.id === parsed.data.lessonId);
    if (!lesson || lesson.domain !== parsed.data.domain) return Response.json({ error: "The lesson context is invalid." }, { status: 400 });
    try {
      return Response.json(await completeLearnerLesson(
        env.DB,
        learnerId,
        {
          lessonId: parsed.data.lessonId,
          domain: parsed.data.domain,
          step: "role_practice",
          transcript: parsed.data.transcript,
          score: parsed.data.score,
          criticalError: parsed.data.criticalError,
          feedback: parsed.data.feedback,
        },
      ));
    } catch (error) {
      if (error instanceof Error && error.message === "QUALIFYING_ATTEMPT_REQUIRED") {
        return Response.json({ error: "Pass this lesson's Role Practice before completing it." }, { status: 409 });
      }
      throw error;
    }
  }

  return new Response("Method not allowed", { status: 405, headers: { allow: "GET, POST" } });
}

async function handleAssessmentRequest(request: Request, env: Env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
  }
  const user = await currentUser(request, env);
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const parsed = assessmentSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "The confirmed transcript is invalid." }, { status: 400 });
  const lesson = parsed.data.lessonId ? lessons.find((entry) => entry.id === parsed.data.lessonId) : undefined;
  if (parsed.data.lessonId && (!lesson || lesson.domain !== parsed.data.domain)) {
    return Response.json({ error: "The lesson context is invalid." }, { status: 400 });
  }
  const terms = lesson ? getTerms(lesson.termIds) : hospitalityTerms.filter((term) => term.domain === parsed.data.domain).slice(0, 6);
  if (env.DB && hasCloudflareAi(env)) {
    const quota = await consumeDailyAiQuota(env.DB, user.id, "assessment");
    if (!quota.allowed) return Response.json({ error: `Daily AI assessment limit reached (${quota.limit}). Continue with tomorrow's practice or use the lesson review.` }, { status: 429 });
  }
  const result = await assessWithCloudflare(env, { ...parsed.data, terms });
  if (env.DB) {
    await recordStepAttempt(env.DB, user.id, {
      lessonId: lesson?.id ?? `${parsed.data.domain}-free-practice`,
      domain: parsed.data.domain,
      step: parsed.data.task,
      transcript: parsed.data.transcript,
      score: result.score,
      criticalError: result.criticalError,
      feedback: result,
    });
  }
  return Response.json(result);
}

async function handleTranscriptionRequest(request: Request, env: Env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
  }
  const user = await currentUser(request, env);
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (!hasCloudflareAi(env)) {
    return Response.json({ error: "Cloudflare speech recognition is not connected yet." }, { status: 503 });
  }
  const form = await request.formData();
  const audio = form.get("audio");
  const domain = form.get("domain") === "hotel" ? "hotel" : "restaurant";
  const lessonId = String(form.get("lessonId") ?? "").slice(0, 120);
  const lesson = lessons.find((entry) => entry.id === lessonId && entry.domain === domain);
  const activityPrompt = lesson?.speakingPrompt ?? String(form.get("prompt") ?? "Hospitality service response").slice(0, 800);
  const approvedTerms = lesson ? getTerms(lesson.termIds).map((term) => term.term).join(", ") : "hospitality service terminology";
  if (!(audio instanceof File)) return Response.json({ error: "No recording was received." }, { status: 400 });
  if (audio.size < 1000) return Response.json({ error: "The recording was too short or silent. Please try again." }, { status: 400 });
  if (audio.size > 10 * 1024 * 1024) return Response.json({ error: "Recording must be under 10 MB." }, { status: 413 });
  if (env.DB) {
    const quota = await consumeDailyAiQuota(env.DB, user.id, "transcription");
    if (!quota.allowed) return Response.json({ error: `Daily recording limit reached (${quota.limit}). You can still type and confirm your transcript.` }, { status: 429 });
  }
  try {
    const context = `${domain} service. Activity: ${activityPrompt}. Approved terms: ${approvedTerms}`;
    const transcript = await transcribeWithCloudflare(env, await audio.arrayBuffer(), context);
    return Response.json({ ...transcript, provider: "cloudflare-workers-ai" });
  } catch {
    return Response.json({ error: "The recording could not be transcribed. Please try again or type the confirmed transcript." }, { status: 502 });
  }
}

async function handleGlossaryRequest(request: Request, env: Env) {
  if (!(await currentUser(request, env))) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").slice(0, 100);
  const department = (url.searchParams.get("department") ?? "").slice(0, 100);
  const limit = Number(url.searchParams.get("limit") ?? 30);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const entries = searchTerms(query, department, Number.isFinite(limit) ? limit : 30, Number.isFinite(offset) ? offset : 0);
  const total = hospitalityTerms.filter((entry) =>
    (!department || entry.department === department) &&
    (!query || `${entry.term} ${entry.department} ${entry.subcategory} ${entry.meaning} ${entry.workplaceUse}`.toLowerCase().includes(query.toLowerCase())),
  ).length;
  return Response.json({ entries, total, departments: glossaryDepartments, source: "HOSPITALITY-MASTER.md", auditedEntries: hospitalityTerms.length });
}

async function handleHistoryRequest(request: Request, env: Env) {
  if (!env.DB) return Response.json({ attempts: [], completions: [] });
  const user = await currentUser(request, env);
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  return Response.json(await getLearnerHistory(env.DB, user.id, Number(new URL(request.url).searchParams.get("limit") ?? 30)));
}

async function handleAdminCertificates(request: Request, env: Env) {
  if (!env.DB) return Response.json({ error: "Certificate storage is unavailable." }, { status: 503 });
  const user = await currentUser(request, env);
  if (!user || user.role !== "admin") return Response.json({ error: "Administrator access is required." }, { status: 403 });
  if (request.method === "GET") return Response.json({ certificates: await listCertificateRequests(env.DB) });
  if (request.method !== "POST" || !sameOrigin(request)) return Response.json({ error: "Request rejected." }, { status: 403 });
  const parsed = certificateActionSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Certificate action is invalid." }, { status: 400 });
  try {
    return Response.json({ certificate: await approveCertificate(env.DB, parsed.data.certificateId, user.id) });
  } catch {
    return Response.json({ error: "The certificate is no longer pending." }, { status: 409 });
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env | undefined, ctx: ExecutionContext): Promise<Response> {
    env = env ?? ({} as Env);
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (url.pathname === "/api/progress") {
      return handleProgressRequest(request, env);
    }

    if (url.pathname === "/api/glossary") return handleGlossaryRequest(request, env);
    if (url.pathname === "/api/catalog") {
      if (!(await currentUser(request, env))) return Response.json({ error: "Sign in is required." }, { status: 401 });
      return Response.json({ lessons, tracks: { hotel: lessons.filter((lesson) => lesson.domain === "hotel").length, restaurant: lessons.filter((lesson) => lesson.domain === "restaurant").length } });
    }
    if (url.pathname === "/api/history") return handleHistoryRequest(request, env);

    if (url.pathname === "/api/auth/status") return handleAuthStatus(request, env);
    if (url.pathname === "/api/auth/setup") return handleSetup(request, env);
    if (url.pathname === "/api/auth/login") return handleLogin(request, env);
    if (url.pathname === "/api/auth/logout") return handleLogout(request, env);
    if (url.pathname === "/api/auth/change-password") return handleChangePassword(request, env);
    if (url.pathname === "/api/admin/users") return handleAdminUsers(request, env);
    if (url.pathname === "/api/admin/certificates") return handleAdminCertificates(request, env);

    if (url.pathname === "/api/assess") {
      return handleAssessmentRequest(request, env);
    }

    if (url.pathname === "/api/transcribe") {
      return handleTranscriptionRequest(request, env);
    }

    if (url.pathname === "/api/ai-status") {
      return Response.json({
        available: hasCloudflareAi(env),
        provider: "Cloudflare Workers AI",
        models: cloudflareAiModels,
        audioRetention: "transient",
        glossaryEntries: hospitalityTerms.length,
        lessons: lessons.length,
        dailyLimits: { assessments: 30, transcriptions: 5 },
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "hospitalingo", architecture: "cloudflare-native", glossaryEntries: hospitalityTerms.length, lessons: lessons.length });
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
