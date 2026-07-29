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

test("renders the ChatGPT-native HospitaLingo learning experience", async () => {
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
  assert.doesNotMatch(html, /class="sidebar"|codex-preview|react-loading-skeleton/i);
});

test("advertises the HospitaLingo MCP tool contract", async () => {
  const worker = await loadWorker();
  const runtimeEnv = { ASSETS: assets };
  const headers = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
  };

  const initialize = await worker.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "hospitalingo-test", version: "1.0.0" },
        },
      }),
    }),
    runtimeEnv,
    context,
  );
  assert.equal(initialize.status, 200);
  const initialized = await initialize.json();
  assert.equal(initialized.result.serverInfo.name, "hospitalingo");

  const listed = await worker.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    }),
    runtimeEnv,
    context,
  );
  assert.equal(listed.status, 200);
  const payload = await listed.json();
  const toolNames = payload.result.tools.map((tool) => tool.name);
  for (const required of [
    "start_onboarding",
    "get_daily_lesson",
    "search_hospitality_terms",
    "get_role_scenario",
    "submit_learning_attempt",
    "get_progress",
    "render_learning_card",
  ]) {
    assert.ok(toolNames.includes(required), `missing MCP tool: ${required}`);
  }
});

test("keeps product metadata, persistence, and official UI foundations", async () => {
  const [page, layout, packageJson, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /25 Restaurant lessons/);
  assert.match(page, /confirmed transcript/i);
  assert.match(layout, /HospitaLingo/);
  assert.match(packageJson, /@openai\/apps-sdk-ui/);
  assert.match(packageJson, /@modelcontextprotocol\/sdk/);
  assert.match(hosting, /"d1": "DB"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", projectRoot)));
});

