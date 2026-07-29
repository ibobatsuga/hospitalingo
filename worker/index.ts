/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { z } from "zod";
import { completeLearnerLesson, getLearnerProgress } from "../lib/progress";
import { handleMcpRequest } from "../mcp/server";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
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

    if (url.pathname === "/mcp") {
      return handleMcpRequest(request, env);
    }

    if (url.pathname === "/api/progress") {
      return handleProgressRequest(request, env);
    }

    if (url.pathname === "/health") {
      return Response.json({ status: "ok", service: "hospitalingo", mcp: "/mcp" });
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
