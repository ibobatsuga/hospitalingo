import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getLesson, hospitalityTerms, scoreHospitalityResponse, type Domain } from "../lib/content";
import { completeLearnerLesson, getLearnerProgress } from "../lib/progress";

const WIDGET_URI = "ui://hospitalingo/learning-card-v1.html";

type McpEnv = { DB?: D1Database };

const fallbackProgress = {
  learnerId: "demo@hospitalingo.local",
  hotelCompleted: 6,
  restaurantCompleted: 5,
  currentLesson: 12,
  certificateEligible: false,
  updatedAt: "demo",
};

function widgetHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;padding:12px;color:CanvasText;background:Canvas}.card{border:1px solid color-mix(in srgb,CanvasText 14%,transparent);border-radius:18px;padding:18px;display:grid;gap:14px}.top{display:flex;justify-content:space-between;gap:12px;align-items:center}.badge{font-size:12px;padding:4px 8px;border-radius:999px;background:color-mix(in srgb,#177e89 14%,Canvas);color:#177e89;font-weight:700}h2{font-size:20px;line-height:1.2;margin:0}p{font-size:14px;line-height:1.5;margin:0;opacity:.74}.progress{height:6px;border-radius:999px;background:color-mix(in srgb,CanvasText 10%,transparent);overflow:hidden}.progress span{display:block;height:100%;width:22%;background:#177e89}.actions{display:flex;gap:8px}button{font:inherit;border:0;border-radius:999px;padding:9px 14px;font-weight:700;cursor:pointer;background:#177e89;color:white}button.secondary{background:transparent;color:CanvasText;border:1px solid color-mix(in srgb,CanvasText 18%,transparent)}
</style></head><body><section class="card" aria-live="polite"><div class="top"><span class="badge" id="domain">HospitaLingo</span><small id="count">Lesson</small></div><div><h2 id="title">Your hospitality lesson is ready</h2><p id="subtitle">Open the lesson to continue.</p></div><div class="progress"><span id="bar"></span></div><div class="actions"><button id="continue">Continue lesson</button><button class="secondary" id="progress">View progress</button></div></section>
<script>
const state={data:null};
function render(data){if(!data)return;state.data=data;document.getElementById('domain').textContent=data.domain==='hotel'?'Hotel Service':'Restaurant Service';document.getElementById('count').textContent='Lesson '+(data.number||1)+' of 50';document.getElementById('title').textContent=data.title||'Your lesson is ready';document.getElementById('subtitle').textContent=data.subtitle||'';document.getElementById('bar').style.width=Math.max(2,Math.min(100,((data.number||1)/50)*100))+'%'}
function follow(prompt){if(window.openai?.sendFollowUpMessage){window.openai.sendFollowUpMessage({prompt});return}window.parent.postMessage({jsonrpc:'2.0',method:'ui/message',params:{role:'user',content:[{type:'text',text:prompt}]}},'*')}
window.addEventListener('message',event=>{if(event.source!==window.parent)return;const m=event.data;if(m?.method==='ui/notifications/tool-result')render(m.params?.structuredContent)});
render(window.openai?.toolOutput);document.getElementById('continue').onclick=()=>follow('Continue my HospitaLingo lesson.');document.getElementById('progress').onclick=()=>follow('Show my HospitaLingo certificate progress.');
</script></body></html>`;
}

function createServer(env: McpEnv) {
  const server = new McpServer(
    { name: "hospitalingo", version: "0.1.0" },
    {
      instructions:
        "HospitaLingo teaches English for hotel and restaurant work. Ground hospitality terms in search_hospitality_terms before explaining them. Keep feedback practical, give at most three corrections, never invent property SOP, and never score pronunciation from transcript-only input.",
    },
  );

  server.registerResource("hospitalingo-learning-card", WIDGET_URI, {}, async () => ({
    contents: [
      {
        uri: WIDGET_URI,
        mimeType: "text/html;profile=mcp-app",
        text: widgetHtml(),
        _meta: { ui: { prefersBorder: false } },
      },
    ],
  }));

  server.registerTool(
    "start_onboarding",
    {
      title: "Start HospitaLingo onboarding",
      description: "Create or resume an internal learner profile before the first lesson.",
      inputSchema: {
        learnerId: z.string().min(3).default("demo@hospitalingo.local"),
        role: z.enum(["student_trainee", "hotel_staff", "restaurant_staff", "supervisor"]).default("student_trainee"),
        level: z.enum(["A1", "A2", "B1"]).default("A2"),
      },
      outputSchema: {
        learnerId: z.string(),
        role: z.string(),
        level: z.string(),
        nextAction: z.string(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ learnerId, role, level }) => ({
      structuredContent: { learnerId, role, level, nextAction: "get_daily_lesson" },
      content: [{ type: "text", text: `HospitaLingo profile ready at ${level}. The prototype will balance Hotel and Restaurant lessons.` }],
    }),
  );

  server.registerTool(
    "get_daily_lesson",
    {
      title: "Get the next HospitaLingo lesson",
      description: "Return the next grounded hospitality English lesson without rendering custom UI.",
      inputSchema: {
        domain: z.enum(["hotel", "restaurant"]).optional(),
        lessonNumber: z.number().int().min(1).max(50).default(1),
      },
      outputSchema: {
        id: z.string(),
        number: z.number(),
        domain: z.string(),
        title: z.string(),
        subtitle: z.string(),
        durationMinutes: z.number(),
        termIds: z.array(z.string()),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ domain, lessonNumber }) => {
      const lesson = getLesson(domain as Domain | undefined, lessonNumber);
      const summary = {
        id: lesson.id,
        number: lessonNumber,
        domain: lesson.domain,
        title: lesson.title,
        subtitle: lesson.subtitle,
        durationMinutes: lesson.durationMinutes,
        termIds: lesson.termIds,
      };
      return {
        structuredContent: summary,
        content: [{ type: "text", text: `${lesson.title} is ready. It includes Vocabulary, Listening, Grammar, Speaking, and Role Practice.` }],
      };
    },
  );

  server.registerTool(
    "search_hospitality_terms",
    {
      title: "Search approved hospitality terms",
      description: "Search only approved adapted terminology from the HospitaLingo knowledge base.",
      inputSchema: { query: z.string().min(1).max(100), domain: z.enum(["hotel", "restaurant"]).optional() },
      outputSchema: {
        terms: z.array(
          z.object({
            id: z.string(),
            term: z.string(),
            domain: z.string(),
            meaning: z.string(),
            workplaceUse: z.string(),
            example: z.string(),
            sourcePage: z.number(),
          }),
        ),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ query, domain }) => {
      const normalized = query.toLowerCase();
      const matches = hospitalityTerms
        .filter((term) => !domain || term.domain === domain)
        .filter((term) => `${term.term} ${term.meaning} ${term.workplaceUse}`.toLowerCase().includes(normalized))
        .slice(0, 8);
      return {
        structuredContent: { terms: matches },
        content: [{ type: "text", text: matches.length ? `Found ${matches.length} approved term(s).` : "No approved term matched that query." }],
      };
    },
  );

  server.registerTool(
    "get_role_scenario",
    {
      title: "Get a hospitality role scenario",
      description: "Return a Hotel or Restaurant role-practice scenario with objective and safety rule.",
      inputSchema: { domain: z.enum(["hotel", "restaurant"]) },
      outputSchema: {
        lessonId: z.string(),
        domain: z.string(),
        role: z.string(),
        objective: z.string(),
        guestMessage: z.string(),
        safetyRule: z.string(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ domain }) => {
      const lesson = getLesson(domain);
      const result = { lessonId: lesson.id, domain, ...lesson.roleScenario };
      return { structuredContent: result, content: [{ type: "text", text: `${lesson.roleScenario.role}: ${lesson.roleScenario.objective}` }] };
    },
  );

  server.registerTool(
    "submit_learning_attempt",
    {
      title: "Submit a confirmed learning attempt",
      description: "Score a user-confirmed transcript for language, service behavior, and critical safety errors.",
      inputSchema: {
        learnerId: z.string().min(3).default("demo@hospitalingo.local"),
        lessonId: z.string().min(1),
        domain: z.enum(["hotel", "restaurant"]),
        transcript: z.string().min(1).max(1200),
        completeLesson: z.boolean().default(false),
      },
      outputSchema: {
        score: z.number(),
        status: z.string(),
        criticalError: z.boolean(),
        corrections: z.array(z.string()),
        progress: z.object({
          hotelCompleted: z.number(),
          restaurantCompleted: z.number(),
          currentLesson: z.number(),
          certificateEligible: z.boolean(),
        }),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ learnerId, lessonId, domain, transcript, completeLesson }) => {
      const feedback = scoreHospitalityResponse(transcript, domain);
      let progress = env.DB ? await getLearnerProgress(env.DB, learnerId) : fallbackProgress;
      if (completeLesson && env.DB) {
        progress = await completeLearnerLesson(env.DB, learnerId, lessonId, domain, feedback.score, feedback.criticalError);
      }
      const compactProgress = {
        hotelCompleted: progress.hotelCompleted,
        restaurantCompleted: progress.restaurantCompleted,
        currentLesson: progress.currentLesson,
        certificateEligible: progress.certificateEligible,
      };
      return {
        structuredContent: { ...feedback, progress: compactProgress },
        content: [{ type: "text", text: `${feedback.status}: ${feedback.score}/100. ${feedback.corrections[0] ?? "The response is operationally safe and clear."}` }],
      };
    },
  );

  server.registerTool(
    "get_progress",
    {
      title: "Get HospitaLingo progress",
      description: "Return Hotel and Restaurant lesson counts plus certificate eligibility.",
      inputSchema: { learnerId: z.string().min(3).default("demo@hospitalingo.local") },
      outputSchema: {
        hotelCompleted: z.number(),
        restaurantCompleted: z.number(),
        currentLesson: z.number(),
        certificateEligible: z.boolean(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ learnerId }) => {
      const progress = env.DB ? await getLearnerProgress(env.DB, learnerId) : fallbackProgress;
      const result = {
        hotelCompleted: progress.hotelCompleted,
        restaurantCompleted: progress.restaurantCompleted,
        currentLesson: progress.currentLesson,
        certificateEligible: progress.certificateEligible,
      };
      return { structuredContent: result, content: [{ type: "text", text: `Hotel ${result.hotelCompleted}/25, Restaurant ${result.restaurantCompleted}/25.` }] };
    },
  );

  server.registerTool(
    "render_learning_card",
    {
      title: "Render a HospitaLingo learning card",
      description: "Render the final inline lesson card after calling get_daily_lesson.",
      inputSchema: {
        id: z.string(),
        number: z.number().int().min(1).max(50),
        domain: z.enum(["hotel", "restaurant"]),
        title: z.string(),
        subtitle: z.string(),
      },
      outputSchema: {
        id: z.string(),
        number: z.number(),
        domain: z.string(),
        title: z.string(),
        subtitle: z.string(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/outputTemplate": WIDGET_URI,
        "openai/toolInvocation/invoking": "Preparing your lesson…",
        "openai/toolInvocation/invoked": "Lesson ready.",
      },
    },
    async (input) => ({
      structuredContent: input,
      content: [{ type: "text", text: `Showing ${input.title}.` }],
    }),
  );

  return server;
}

export async function handleMcpRequest(request: Request, env: McpEnv): Promise<Response> {
  const server = createServer(env);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
