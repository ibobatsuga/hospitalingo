import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

const context = { waitUntil() {}, passThroughOnException() {} };
const assets = { fetch: async () => new Response("Not found", { status: 404 }) };

test("renders the HospitaLingo account entry experience", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: assets },
    context,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /HospitaLingo — English for Hotel &amp; Restaurant/i);
  assert.match(html, /Your own practice journey/i);
  assert.match(html, /Preparing your learning space/i);
  assert.doesNotMatch(html, /class="sidebar"|codex-preview|react-loading-skeleton/i);
});

test("provides local demo identity and rejects missing production account storage", async () => {
  const worker = await loadWorker();
  const localStatus = await worker.fetch(new Request("http://localhost/api/auth/status"), { ASSETS: assets }, context);
  assert.equal(localStatus.status, 200);
  const localPayload = await localStatus.json();
  assert.equal(localPayload.authenticated, true);
  assert.equal(localPayload.user.role, "admin");

  const productionStatus = await worker.fetch(new Request("https://hospitalingo.example/api/auth/status"), { ASSETS: assets }, context);
  assert.equal(productionStatus.status, 503);
});

test("advertises Cloudflare AI status and keeps a safe assessment fallback", async () => {
  const worker = await loadWorker();
  const runtimeEnv = { ASSETS: assets };
  const status = await worker.fetch(new Request("http://localhost/api/ai-status"), runtimeEnv, context);
  assert.equal(status.status, 200);
  const statusPayload = await status.json();
  assert.equal(statusPayload.provider, "Cloudflare Workers AI");
  assert.equal(statusPayload.available, false);
  assert.equal(statusPayload.audioRetention, "transient");

  const assessed = await worker.fetch(
    new Request("http://localhost/api/assess", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        domain: "restaurant",
        task: "speaking",
        transcript: "Thank you for telling me. Let me check the ingredients with the kitchen.",
      }),
    }),
    runtimeEnv,
    context,
  );
  assert.equal(assessed.status, 200);
  const feedback = await assessed.json();
  assert.equal(feedback.provider, "rules-fallback");
  assert.equal(feedback.criticalError, false);
  assert.ok(feedback.score >= 75);
});

test("uses contextual Cloudflare transcription and preserves the raw version", async () => {
  const worker = await loadWorker();
  const models = [];
  const runtimeEnv = {
    ASSETS: assets,
    AI: {
      async run(model, input) {
        models.push({ model, input });
        if (model.includes("whisper")) return { text: "Please keep the chicken open." };
        return { response: '{"text":"Please keep the check open."}' };
      },
    },
  };
  const form = new FormData();
  form.append("audio", new File([new Uint8Array(1400)], "answer.webm", { type: "audio/webm" }));
  form.append("domain", "restaurant");
  form.append("prompt", "Explain that the open check remains active.");
  form.append("terms", "Open check, cover, void");

  const response = await worker.fetch(
    new Request("http://localhost/api/transcribe", { method: "POST", body: form }),
    runtimeEnv,
    context,
  );
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.rawText, "Please keep the chicken open.");
  assert.equal(payload.text, "Please keep the check open.");
  assert.equal(payload.normalized, true);
  assert.match(models[0].model, /whisper-large-v3-turbo/);
  assert.equal(models[0].input.language, "en");
  assert.match(models[0].input.initial_prompt, /Open check/);
});

test("keeps product metadata and Cloudflare persistence foundations", async () => {
  const [page, layout, packageJson, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /25 Restaurant lessons/);
  assert.match(page, /confirmed transcript/i);
  assert.match(page, /Record answer/i);
  assert.match(page, /Create the administrator/i);
  assert.match(page, /Import up to 100 accounts/i);
  assert.match(layout, /HospitaLingo/);
  assert.doesNotMatch(packageJson, /@openai\/apps-sdk-ui/);
  assert.doesNotMatch(packageJson, /@modelcontextprotocol\/sdk/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "CONTENT"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", projectRoot)));
});

test("preserves the complete audited hospitality terminology source", async () => {
  const markdown = await readFile(new URL("../content/HOSPITALITY-MASTER.md", import.meta.url), "utf8");
  const entries = [...markdown.matchAll(/^## (\d{1,3})\. /gm)].map((match) => Number(match[1]));
  assert.equal(entries.length, 436);
  assert.equal(entries.filter((number) => number === 81).length, 2);
  assert.equal(entries.filter((number) => number === 160).length, 2);
  assert.equal(entries.filter((number) => number === 356).length, 1);
  assert.match(markdown, /declared_terminology_entries: 356/);
  assert.match(markdown, /body_terminology_entries: 436/);
  assert.match(markdown, /Nomor 81-160 digunakan dua kali/);
  for (const section of [
    "Pengertian",
    "Landasan Teoritis",
    "Peran dan Fungsi",
    "Parameter dan Formulasi",
    "Simulasi",
    "Dampak",
    "Faktor Risiko",
    "Tindakan Pengendalian",
    "Intisari",
  ]) {
    assert.equal([...markdown.matchAll(new RegExp(`^### ${section}$`, "gm"))].length, 436);
  }
});
