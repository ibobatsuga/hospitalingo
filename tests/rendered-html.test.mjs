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

test("renders the Cloudflare-native HospitaLingo learning experience", async () => {
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
  assert.match(html, /Handle an allergy request/i);
  assert.match(html, /Certificate pathway/i);
  assert.match(html, /Continue lesson/i);
  assert.match(html, /Cloudflare AI/i);
  assert.doesNotMatch(html, /class="sidebar"|codex-preview|react-loading-skeleton/i);
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
  assert.match(layout, /HospitaLingo/);
  assert.doesNotMatch(packageJson, /@openai\/apps-sdk-ui/);
  assert.doesNotMatch(packageJson, /@modelcontextprotocol\/sdk/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "CONTENT"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", projectRoot)));
});
