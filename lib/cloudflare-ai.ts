import { hospitalityTerms, scoreHospitalityResponse, type Domain } from "./content";

export type AiBinding = {
  run(model: string, input: unknown): Promise<unknown>;
};

export type CloudflareAiEnv = {
  AI?: AiBinding;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_AI_TOKEN?: string;
};

export type HospitalityAssessment = ReturnType<typeof scoreHospitalityResponse> & {
  modelAnswer: string;
  provider: "cloudflare-workers-ai" | "rules-fallback";
};

const TEXT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const SPEECH_MODEL = "@cf/openai/whisper";

export function hasCloudflareAi(env: CloudflareAiEnv) {
  return Boolean(env.AI || (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN));
}

async function runModel(env: CloudflareAiEnv, model: string, input: unknown) {
  if (env.AI) return env.AI.run(model, input);

  if (env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.CLOUDFLARE_AI_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      },
    );
    if (!response.ok) throw new Error(`Cloudflare AI returned ${response.status}.`);
    const payload = (await response.json()) as { result?: unknown };
    return payload.result;
  }

  throw new Error("Cloudflare AI is not configured.");
}

function extractJson(value: unknown) {
  const text =
    typeof value === "string"
      ? value
      : typeof value === "object" && value && "response" in value
        ? String((value as { response: unknown }).response)
        : JSON.stringify(value);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The AI assessment did not contain JSON.");
  return JSON.parse(match[0]) as Record<string, unknown>;
}

export async function assessWithCloudflare(
  env: CloudflareAiEnv,
  input: {
    domain: Domain;
    transcript: string;
    task: "speaking" | "role_practice";
    prompt?: string;
    safetyRule?: string;
  },
): Promise<HospitalityAssessment> {
  const deterministic = scoreHospitalityResponse(input.transcript, input.domain);
  if (!hasCloudflareAi(env)) {
    return {
      ...deterministic,
      modelAnswer:
        input.domain === "restaurant"
          ? "Thank you for telling me. Let me confirm the ingredients with the kitchen before I advise you."
          : "I will be happy to check our current availability and confirm the options for you.",
      provider: "rules-fallback",
    };
  }

  const glossary = hospitalityTerms
    .filter((term) => term.domain === input.domain)
    .map((term) => `${term.term}: ${term.workplaceUse}. Example: ${term.example}`)
    .join("\n");

  try {
    const result = await runModel(env, TEXT_MODEL, {
      messages: [
        {
          role: "system",
          content: `You are HospitaLingo, an English coach for hotel and restaurant operations. Assess only the confirmed transcript. Be concise and supportive. Never override operational safety. Return JSON only with: score (integer 0-100), status (Ready, Developing, or Needs practice), criticalError (boolean), corrections (array of at most 3 short strings), and modelAnswer (one natural English response).`,
        },
        {
          role: "user",
          content: `Domain: ${input.domain}\nActivity: ${input.task}\nPrompt: ${input.prompt ?? "Hospitality service response"}\nSafety rule: ${input.safetyRule ?? "Do not guess or overpromise."}\nApproved terminology context:\n${glossary}\n\nConfirmed learner transcript:\n${input.transcript}`,
        },
      ],
      max_tokens: 450,
      temperature: 0.2,
    });
    const parsed = extractJson(result);
    const aiScore = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    const criticalError = deterministic.criticalError || parsed.criticalError === true;
    const corrections = Array.isArray(parsed.corrections)
      ? parsed.corrections.filter((item): item is string => typeof item === "string").slice(0, 3)
      : deterministic.corrections;

    return {
      score: criticalError ? Math.min(aiScore, 60) : aiScore,
      status: criticalError ? "Needs practice" : aiScore >= 75 ? "Ready" : "Developing",
      criticalError,
      corrections: corrections.length ? corrections : deterministic.corrections,
      modelAnswer:
        typeof parsed.modelAnswer === "string" && parsed.modelAnswer.trim()
          ? parsed.modelAnswer.trim()
          : input.transcript,
      provider: "cloudflare-workers-ai",
    };
  } catch {
    return {
      ...deterministic,
      modelAnswer:
        input.domain === "restaurant"
          ? "Thank you for telling me. Let me confirm the ingredients with the kitchen before I advise you."
          : "I will be happy to check our current availability and confirm the options for you.",
      provider: "rules-fallback",
    };
  }
}

export async function transcribeWithCloudflare(env: CloudflareAiEnv, audio: ArrayBuffer) {
  if (!hasCloudflareAi(env)) throw new Error("Cloudflare AI is not configured.");
  const result = await runModel(env, SPEECH_MODEL, { audio: Array.from(new Uint8Array(audio)) });
  if (typeof result === "object" && result && "text" in result) {
    return String((result as { text: unknown }).text).trim();
  }
  throw new Error("Cloudflare speech recognition returned no transcript.");
}

export const cloudflareAiModels = { text: TEXT_MODEL, speech: SPEECH_MODEL };
