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
import { completeLearnerLesson, getLearnerProgress } from "../lib/progress";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  CONTENT?: R2Bucket;
  AI?: AiBinding;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_AI_TOKEN?: string;
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
});

const assessmentSchema = z.object({
  domain: z.enum(["hotel", "restaurant"]),
  transcript: z.string().trim().min(2).max(3000),
  task: z.enum(["speaking", "role_practice"]),
  prompt: z.string().max(1000).optional(),
  safetyRule: z.string().max(1000).optional(),
});

function learnerIdFor(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (email) return email;
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" ? "demo@hospitalingo.local" : null;
}

async function handleProgressRequest(request: Request, env: Env) {
  const learnerId = learnerIdFor(request);
  if (!learnerId) return Response.json({ error: "Internal HospitaLingo access is required." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "Progress storage is unavailable." }, { status: 503 });

  if (request.method === "GET") {
    return Response.json(await getLearnerProgress(env.DB, learnerId));
  }

  if (request.method === "POST") {
    const parsed = completionSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "The lesson result is invalid." }, { status: 400 });
    return Response.json(
      await completeLearnerLesson(
        env.DB,
        learnerId,
        parsed.data.lessonId,
        parsed.data.domain,
        parsed.data.score,
        parsed.data.criticalError,
      ),
    );
  }

  return new Response("Method not allowed", { status: 405, headers: { allow: "GET, POST" } });
}

async function handleAssessmentRequest(request: Request, env: Env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
  }
  const parsed = assessmentSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "The confirmed transcript is invalid." }, { status: 400 });
  return Response.json(await assessWithCloudflare(env, parsed.data));
}

async function handleTranscriptionRequest(request: Request, env: Env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
  }
  if (!hasCloudflareAi(env)) {
    return Response.json({ error: "Cloudflare speech recognition is not connected yet." }, { status: 503 });
  }
  const form = await request.formData();
  const audio = form.get("audio");
  const domain = form.get("domain") === "hotel" ? "hotel" : "restaurant";
  const activityPrompt = String(form.get("prompt") ?? "Hospitality service response").slice(0, 800);
  const suppliedTerms = String(form.get("terms") ?? "").slice(0, 600);
  if (!(audio instanceof File)) return Response.json({ error: "No recording was received." }, { status: 400 });
  if (audio.size < 1000) return Response.json({ error: "The recording was too short or silent. Please try again." }, { status: 400 });
  if (audio.size > 10 * 1024 * 1024) return Response.json({ error: "Recording must be under 10 MB." }, { status: 413 });
  try {
    const context = `${domain} service. Activity: ${activityPrompt}. Approved terms: ${suppliedTerms}`;
    const transcript = await transcribeWithCloudflare(env, await audio.arrayBuffer(), context);
    return Response.json({ ...transcript, provider: "cloudflare-workers-ai" });
  } catch {
    return Response.json({ error: "The recording could not be transcribed. Please try again or type the confirmed transcript." }, { status: 502 });
  }
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
      });
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "hospitalingo", architecture: "cloudflare-native" });
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
